/**
 * Keno Store — High-Performance Arabic Search & Filter Engine
 * Normalizes diacritics, unifies Arabic letter variants, matches custom service aliases,
 * searches plan labels, and provides multi-criteria sorting.
 */
(function (root) {
  'use strict';

  const KenoSearch = {
    /**
     * Normalizes Arabic text for flexible matching.
     * @param {string} text
     * @returns {string} Normalized string
     */
    normalize(text) {
      if (!text) return '';
      return String(text)
        .normalize('NFKC')
        .toLowerCase()
        // Remove Tashkeel (harakat) and Tatweel (kashida)
        .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
        // Normalize Alef variants
        .replace(/[أإآ]/g, 'ا')
        // Normalize Yaa / Alef Maqsura
        .replace(/ى/g, 'ي')
        // Normalize Taa Marbuta
        .replace(/ة/g, 'ه')
        // Normalize Eastern Arabic / Persian numerals to Western digits
        .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
        .trim();
    },

    /**
     * Calculates the minimum available price for a service.
     * @param {Object} service
     * @returns {number|null} Minimum price, or null if on-demand/no available plans
     */
    minPrice(service) {
      if (!service || !Array.isArray(service.plans)) return null;
      const availablePlans = service.plans.filter(p => p.available);
      if (availablePlans.length === 0) return null;
      return Math.min(...availablePlans.map(p => p.price));
    },

    /**
     * Filters and sorts services based on query, category, and sort criteria.
     * @param {Object} catalog - Validated catalog object
     * @param {Object} criteria - { query, category, sort }
     * @returns {Array<Object>} Filtered services
     */
    filter(catalog, { query = '', category = 'all', sort = 'featured' } = {}) {
      if (!catalog || !Array.isArray(catalog.services)) return [];

      const terms = this.normalize(query).split(/\s+/).filter(Boolean);
      const defaultAliases = root.KenoConfig?.DEFAULT_ALIASES || {};

      const filtered = catalog.services.filter(service => {
        // Only show visible services to visitors
        if (!service.visible) return false;

        // Category filter
        if (category !== 'all' && service.category !== category) {
          return false;
        }

        // If no query terms, passes filter
        if (terms.length === 0) return true;

        // Build comprehensive searchable corpus
        const catObj = catalog.categories.find(c => c.id === service.category);
        const categoryName = catObj ? catObj.name : '';
        const customAliases = service.aliases || '';
        const fallbackAliases = defaultAliases[service.id] || '';
        const planLabels = (service.plans || []).map(p => p.label).join(' ');

        const searchCorpus = this.normalize([
          service.name,
          service.mark,
          service.description,
          categoryName,
          customAliases,
          fallbackAliases,
          planLabels
        ].join(' '));

        // Every term must be present in the corpus (AND matching)
        return terms.every(term => searchCorpus.includes(term));
      });

      // Sort results
      return filtered.sort((a, b) => {
        if (sort === 'price-asc') {
          const priceA = this.minPrice(a) ?? Infinity;
          const priceB = this.minPrice(b) ?? Infinity;
          return priceA - priceB;
        }
        if (sort === 'price-desc') {
          const priceA = this.minPrice(a) ?? -Infinity;
          const priceB = this.minPrice(b) ?? -Infinity;
          return priceB - priceA;
        }
        if (sort === 'name') {
          return a.name.localeCompare(b.name, 'ar');
        }
        // Default: featured first, then retain catalog order
        if (Boolean(b.featured) !== Boolean(a.featured)) {
          return Number(b.featured) - Number(a.featured);
        }
        return 0;
      });
    }
  };

  root.KenoSearch = KenoSearch;
})(typeof window !== 'undefined' ? window : this);
