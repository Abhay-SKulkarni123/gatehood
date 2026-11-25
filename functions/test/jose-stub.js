module.exports = {
  importJWK: async () => {
    throw new Error('jose is stubbed in unit tests');
  },
  exportSPKI: async () => {
    throw new Error('jose is stubbed in unit tests');
  },
  decodeJwt: () => {
    throw new Error('jose is stubbed in unit tests');
  },
  decodeProtectedHeader: () => {
    throw new Error('jose is stubbed in unit tests');
  },
};
