/* Generated artwork defaults. Uploaded service images always take precedence. */
(function (root) {
  'use strict';
  const services = new Set(['pubg','netflix','chatgpt','shahid','efootball','tiktok','pubg-korea','roblox','free-fire','fc-mobile','yalla-ludo','pubg-vietnam','mobile-legends','blood-strike','coin-master','other-games','osn','yango','crunchyroll','iptv','music','gemini','claude','other-ai','google-play','app-store','software','renew','courses','websites','paypal','online-buy','facebook-ads','instagram-ads','tiktok-ads','snapchat-ads','campaigns','design','facebook-pages','social-setup','custom-service']);
  root.KenoServiceArt = {
    desktop(id) { return services.has(id) ? `assets/services-glass-v2/${id}-desktop.webp` : ''; },
    mobile(id) { return services.has(id) ? `assets/services-glass-v2/${id}.webp` : ''; },
    upgrade(url, id) {
      if (!services.has(id)) return url;
      const old = String(url || '').replace(/^\.\//, '');
      if (old === `assets/services-v1/${id}-desktop.webp`) return this.desktop(id);
      if (old === `assets/services-v1/${id}.webp`) return this.mobile(id);
      return url;
    }
  };
})(typeof window !== 'undefined' ? window : this);
