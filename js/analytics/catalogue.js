export const pages = {
    '/': 'Home',
    '/index.html': 'Home',
    '/blog/': 'Blog',
    '/blog/index.html': 'Blog',
    '/blog/mnist-from-scratch.html': 'Neural network article',
    '/blog/chess-fragments-engine.html': 'Chess engine article',
    '/blog/chessweb.html': 'Chessweb article',
    '/blog/artificial-synapse-research-internship.html': 'Research article',
    '/research/': 'Research',
    '/research/index.html': 'Research',
    '/research/animations/neuro_signal_biology.html': 'Biology demo',
    '/research/animations/biological_memristor_synapse.html': 'Memristor demo',
    '/research/animations/memristor_short_term_memory.html': 'Memory demo',
    '/research/animations/model_output_comparison.html': 'Model comparison demo'
};

export const events = ['CV click', 'Poster click', 'Email click', 'LinkedIn click',
    'GitHub click', 'Project link', 'Neural network used', 'Chess used', 'Maze used',
    'Research demo used', 'Article 25%', 'Article 50%', 'Article 90%',
    'Project: Neural network', 'Project: Chess engine', 'Project: Maze solver',
    'Project: Six Nations', 'Project: Chessweb', 'Project: Bible app'];

export const steps = new Set([...Object.values(pages), ...events]);
export const maxSteps = 40;
export const visitTimeout = 30 * 60 * 1000;
