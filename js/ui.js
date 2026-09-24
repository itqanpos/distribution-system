/* Compatibility helpers for the representative pages. */
(function () {
    'use strict';

    window.UI = {
        async initPage(title) {
            if (title) document.title = `${title} - نظام حسابي`;
        },
        async logout() {
            await window.Auth?.logout();
        }
    };
})();

