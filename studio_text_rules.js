const StudioText = {
  normalize(value) {
    return String(value ?? '').normalize('NFKC')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
      .replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
  },
  hasContent(value) { return this.normalize(value).length >= 2; },
  changed(value, baseline) {
    const a = this.normalize(value), b = this.normalize(baseline);
    return this.hasContent(value) && a !== b;
  }
};
if (typeof module !== 'undefined') module.exports = StudioText;
