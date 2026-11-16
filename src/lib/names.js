export const normTeam = (s = '') => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
