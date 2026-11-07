import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleBlogRequest } from '../server/blog.mjs';

test('blog posts persist, drafts remain private, and writes require the local editor',async () => {
  const temporary = await mkdtemp(join(tmpdir(),'evan-blog-test-'));
  const storagePath = join(temporary,'posts.json');
  const server = http.createServer(async (req,res) => {
    if (!await handleBlogRequest(req,res,new URL(req.url,'http://localhost').pathname,{storagePath})) res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path,options={}) => fetch(base + path,{...options,headers:{Origin:base,...options.headers}});
  const postInput = {title:'Testing a security note',category:'Security',body:'# My note\n\n<img src=x onerror=alert(1)>\n\n**Important** context.',status:'draft'};
  const save = input => request('/api/blog/admin/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  try {
    let response = await request('/api/blog/admin');
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{canEdit:true,posts:[]});
    response = await fetch(base + '/api/blog/admin/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(postInput)});
    assert.equal(response.status,403,'no-origin authoring request must be refused');
    response = await request('/api/blog/admin/posts',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify(postInput)});
    assert.equal(response.status,403,'foreign-origin authoring request must be refused');
    response = await save(postInput);
    assert.equal(response.status,200);
    const created = (await response.json()).post;
    assert.equal(created.status,'draft');
    assert.equal(created.author,'Evan Bartkowski');
    assert.equal(created.slug,'testing-a-security-note');
    assert.equal(JSON.parse(await readFile(storagePath,'utf8')).posts[0].id,created.id);
    assert.deepEqual((await (await request('/api/blog/posts')).json()).posts,[],'drafts are not public');
    response = await save({...postInput,id:created.id,slug:created.slug,status:'published'});
    assert.equal(response.status,200);
    assert.equal((await (await request('/api/blog/posts')).json()).posts.length,1);
    response = await save({...postInput,slug:created.slug,status:'published'});
    assert.equal(response.status,409,'slug collisions must not overwrite another post');
    response = await save({...postInput,id:created.id,slug:created.slug,status:'draft'});
    assert.equal(response.status,200);
    assert.deepEqual((await (await request('/api/blog/posts')).json()).posts,[],'unpublishing hides a post');
    for (const input of [{...postInput,title:''},{...postInput,slug:'../secret'},{...postInput,body:'a'.repeat(30001)},{...postInput,status:'anything'}]) {
      assert.equal((await save(input)).status,400,'invalid data should be rejected');
    }
    response = await request(`/api/blog/admin/posts/${created.id}`,{method:'DELETE'});
    assert.equal(response.status,200);
    assert.deepEqual(JSON.parse(await readFile(storagePath,'utf8')).posts,[]);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert(temporary.startsWith(join(tmpdir(),'evan-blog-test-')),'cleanup must stay in the explicitly created test directory');
    await rm(temporary,{recursive:true,force:true});
  }
});
