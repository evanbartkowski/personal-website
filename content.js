// Public profile details verified against the author's existing project configuration.
// Update this file to personalize the portfolio without changing presentation code.
export const profile = {
  name: 'Evan Bartkowski', firstName: 'Evan', role: 'Developer & creative builder',
  email: 'evanbartkowski1@gmail.com',
  github: 'https://github.com/evanbartkowski',
  linkedin: 'https://www.linkedin.com/in/evan-bartkowski-31274b299',
};
export const projects = [
  {
    id: 'mma', number: '01', title: 'MMA Cipher', category: 'DATA · WEB APPLICATION',
    short: 'Finding the signal in the fight.',
    description: 'A UFC prediction platform that turns fighter statistics, matchup data, and upcoming events into an explorable fight dashboard.',
    problem: 'Fight data lives across events, rankings, and individual fighter records. A useful matchup starts with bringing that context together.',
    approach: 'A Python and Flask application prepares the data, while a static publishing workflow delivers the dashboard through Firebase Hosting.',
    detail: 'The project combines scheduled data refreshes, fighter comparisons, event navigation, and search-friendly static pages.',
    tags: ['Python', 'Flask', 'Firebase', 'Data pipelines'], color: 'sage',
    url: 'https://mma-oracle.web.app', linkLabel: 'Explore MMA Cipher',
  },
  {
    id: 'jinx', number: '02', title: 'JinxKiss', category: 'INTERACTIVE · SOCIAL GAME',
    short: 'A little chaos. A lot of connection.',
    description: 'A browser-based party game built around prompt cards, distinct game modes, and custom decks. Designed to get people off script.',
    problem: 'A social game has to keep the next interaction simple while making its prompts feel right for the people and mode playing.',
    approach: 'A React and TypeScript interface handles card draws, game modes, and locally stored custom decks, with Firebase providing the hosted experience.',
    detail: 'Category-aware prompt selection and permanent admin editing support a growing library without mixing the wrong games or categories.',
    tags: ['React', 'TypeScript', 'Firebase', 'Interaction design'], color: 'lavender',
    url: 'https://jinxkiss.com', linkLabel: 'Play JinxKiss',
  },
  {
    id: 'hours', number: '03', title: 'Small Hours', category: 'SIMULATION · DESKTOP',
    short: 'An entire life in the little decisions.',
    description: 'A native life simulation where everyday choices unfold into careers, relationships, finances, and the unexpected turns in between.',
    problem: 'A life simulation needs a lot of interconnected systems, yet each decision should remain understandable and personal.',
    approach: 'A Python and Tkinter desktop experience brings character progression, save slots, a world map, and a large situation library into one native interface.',
    detail: 'The work spans simulation logic, persistent player saves, accessible interface components, content, and Windows packaging.',
    tags: ['Python', 'Tkinter', 'Simulation', 'Persistence'], color: 'amber',
    url: null, linkLabel: null,
  },
  {
    id: 'rail', number: '04', title: 'DREADRAIL', category: '3D · SURVIVAL HORROR',
    short: 'Keep the lights on. Stay on the rails.',
    description: 'A browser survival-horror game that puts its tension into the environment: camera feeds, scarce resources, and a train that never feels safe.',
    problem: 'Horror depends on reliable controls and atmosphere. Interfaces should feel like part of the world without hiding the information players need.',
    approach: 'React, TypeScript, and Three.js combine a 3D scene with physical controls, environmental audio, and a compatibility renderer.',
    detail: 'The project explores camera systems, enemy simulation, run-scoped progression, diegetic interfaces, and graceful recovery from rendering failures.',
    tags: ['Three.js', 'React', 'TypeScript', 'Game systems'], color: 'steel',
    url: null, linkLabel: null,
  },
];
