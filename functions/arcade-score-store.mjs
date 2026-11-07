const validScore = value => Number.isSafeInteger(value) && value>=0 && value<=1_200;
function recordOf(value) {
  const highScore = validScore(value?.highScore) ? value.highScore : 0;
  const timestamp = typeof value?.updatedAt?.toMillis==='function' ? value.updatedAt.toMillis() : value?.updatedAt instanceof Date ? value.updatedAt.getTime() : null;
  return {highScore,updatedAt:timestamp!==null && Number.isFinite(timestamp)?new Date(timestamp).toISOString():null};
}

// One Admin-only record has no TTL. The transaction compares against the
// latest stored maximum, including concurrent submissions and cold starts.
export function createArcadeScoreStore({db} = {}) {
  if (!db || typeof db.runTransaction!=='function') throw Error('Arcade database unavailable');
  const record=db.collection('arcade_records').doc('flappy');
  return {
    async getRecord(){const document=await record.get();return recordOf(document.exists?document.data():null);},
    async submitScore({score,now}) {
      if (!validScore(score) || !Number.isFinite(now)) throw Error('Invalid verified score');
      return db.runTransaction(async transaction=>{
        const document=await transaction.get(record), previous=recordOf(document.exists?document.data():null);
        if (score<=previous.highScore) return {...previous,record:false};
        transaction.set(record,{highScore:score,updatedAt:new Date(now)});
        return {highScore:score,updatedAt:new Date(now).toISOString(),record:true};
      },{maxAttempts:3});
    },
  };
}
