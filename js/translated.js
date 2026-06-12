
/* =============================================
   Translated Movies Page Logic
   Reads from the "Translated" node in Firebase
   ============================================= */

var TranslatedAppState = {
  lastLoadedKey: null,
  currentCategory: 'all',
  currentSort: 'recent',
  currentSearch: '',
  itemsPerPage: 99999 // Changed from 8 to load all at once

};

/* Firebase path — reads directly from Translated/ */
var TRANSLATED_FB_PATH = 'Translated'

/* =============================================
   Initialization
   ============================================= */
function initTranslatedPage() {
  var urlParams = new URLSearchParams(window.location.search);

  /* Parse URL parameters */
  TranslatedAppState.currentSearch = urlParams.get('search') || '';
  var sortParam = urlParams.get('sort');
  if (sortParam === 'trending' || sortParam === 'views' || sortParam === 'likes') {
    TranslatedAppState.currentSort = sortParam;
  }

  var catParam = urlParams.get('category');
  if (catParam) TranslatedAppState.currentCategory = catParam;

  /* Apply initial state to DOM */
  var catFilter = document.getElementById('category-filter');
  var sortFilter = document.getElementById('sort-filter');
  var searchInput = document.getElementById('sidebar-search');
  var heroTitle = document.getElementById('viewall-title');
  var breadcrumb = document.getElementById('breadcrumb-current');

  if (catFilter) catFilter.value = TranslatedAppState.currentCategory;
  if (sortFilter) sortFilter.value = TranslatedAppState.currentSort;
  if (searchInput && TranslatedAppState.currentSearch) searchInput.value = TranslatedAppState.currentSearch;
  if (heroTitle) heroTitle.textContent = 'All Translations';
  if (breadcrumb) breadcrumb.textContent = 'Translated Movies';

  /* Render everything */
  updateActiveFiltersUI();
  renderTranslatedVideos(false);
  updateTranslatedCategoryCounts();
  renderTranslatedPopular();

  /* Bind all interactive events */
  bindTranslatedEvents();
}

/* =============================================
   Event Bindings
   ============================================= */
function bindTranslatedEvents() {
  /* Category filter dropdown */
  var catFilter = document.getElementById('category-filter');
  if (catFilter) {
    catFilter.addEventListener('change', function() {
      TranslatedAppState.currentCategory = this.value;
      TranslatedAppState.lastLoadedKey = null;
      syncSidebarActiveState();
      updateActiveFiltersUI();
      renderTranslatedVideos(false);
    });
  }
  
  /* Sort filter dropdown */
  var sortFilter = document.getElementById('sort-filter');
  if (sortFilter) {
    sortFilter.addEventListener('change', function() {
      TranslatedAppState.currentSort = this.value;
      TranslatedAppState.lastLoadedKey = null;
      renderTranslatedVideos(false);
    });
  }
  
  /* Sidebar category links */
  var sidebarCategories = document.getElementById('sidebar-categories');
  if (sidebarCategories) {
    sidebarCategories.addEventListener('click', function(e) {
      e.preventDefault();
      var link = e.target.closest('a[data-category]');
      if (!link) return;
      
      var allLinks = sidebarCategories.querySelectorAll('a');
      for (var i = 0; i < allLinks.length; i++) {
        allLinks[i].classList.remove('active');
      }
      link.classList.add('active');
      
      TranslatedAppState.currentCategory = link.dataset.category;
      TranslatedAppState.lastLoadedKey = null;
      if (catFilter) catFilter.value = TranslatedAppState.currentCategory;
      updateActiveFiltersUI();
      renderTranslatedVideos(false);
    });
  }
  
  /* Tag cloud — search by VJ name */
  var tagCloud = document.getElementById('tag-cloud');
  if (tagCloud) {
    tagCloud.addEventListener('click', function(e) {
      e.preventDefault();
      var tag = e.target.closest('.tag[data-vj]');
      if (!tag) return;
      
      var vjSlug = tag.dataset.vj;
      TranslatedAppState.currentCategory = vjSlug;
      TranslatedAppState.lastLoadedKey = null;
      
      if (catFilter) catFilter.value = vjSlug;
      syncSidebarActiveState();
      updateActiveFiltersUI();
      renderTranslatedVideos(false);
    });
  }
  
  /* Load More button - REMOVED (no longer needed) */
  
  /* Clear all filters button */
  var clearBtn = document.getElementById('clear-all-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      clearTranslatedFilters();
    });
  }
}

/* =============================================
   Active Filters UI
   ============================================= */
function updateActiveFiltersUI() {
  var filtersDiv = document.getElementById('active-filters');
  var chipsDiv = document.getElementById('active-filter-chips');
  var clearBtn = document.getElementById('clear-all-filters');

  if (!filtersDiv || !chipsDiv || !clearBtn) return;

  var hasActiveFilters = TranslatedAppState.currentSearch || TranslatedAppState.currentCategory !== 'all';

  if (hasActiveFilters) {
    filtersDiv.style.display = 'flex';
    var chipsHTML = '';

    if (TranslatedAppState.currentSearch) {
      chipsHTML += '<span class="active-filter-chip">Search: "' + escapeHTML(TranslatedAppState.currentSearch) + '"</span>';
    }

    if (TranslatedAppState.currentCategory !== 'all') {
      var catName = TranslatedAppState.currentCategory.replace('vj-', 'VJ ');
      chipsHTML += '<span class="active-filter-chip">VJ: ' + escapeHTML(catName) + '</span>';
    }

    chipsDiv.innerHTML = chipsHTML;
    clearBtn.style.display = 'inline-flex';
  } else {
    filtersDiv.style.display = 'none';
    clearBtn.style.display = 'none';
  }
}

/**
 * Clears all active filters and resets the grid.
 */
function clearTranslatedFilters() {
  TranslatedAppState.currentSearch = '';
  TranslatedAppState.currentCategory = 'all';
  TranslatedAppState.lastLoadedKey = null;
  TranslatedAppState.currentSort = 'recent';

  var catFilter = document.getElementById('category-filter');
  var sortFilter = document.getElementById('sort-filter');
  var searchInput = document.getElementById('sidebar-search');

  if (catFilter) catFilter.value = 'all';
  if (sortFilter) sortFilter.value = 'recent';
  if (searchInput) searchInput.value = '';

  syncSidebarActiveState();
  updateActiveFiltersUI();
  renderTranslatedVideos(false);
}

/* =============================================
   Firebase Fetch — reads from Translated/
   ============================================= */
function fetchTranslatedVideos(append) {
  var ref = database.ref(TRANSLATED_FB_PATH).orderByKey();
  
  return ref.once('value').then(function(snapshot) {
    var videos = [];
    snapshot.forEach(function(child) {
      var data = child.val();
      data._id = child.key;
      videos.push(data);
    });
    
    /* Filter by VJ name */
    if (TranslatedAppState.currentCategory && TranslatedAppState.currentCategory !== 'all') {
      videos = videos.filter(function(v) {
        return (v.vjName || '').toLowerCase() === TranslatedAppState.currentCategory;
      });
    }
    
    /* Filter by search query */
    if (TranslatedAppState.currentSearch && TranslatedAppState.currentSearch.trim()) {
      var q = TranslatedAppState.currentSearch.toLowerCase();
      videos = videos.filter(function(v) {
        return (v.title || '').toLowerCase().indexOf(q) >= 0 ||
          (v.description || '').toLowerCase().indexOf(q) >= 0 ||
          (v.vjName || '').toLowerCase().indexOf(q) >= 0 ||
          (v.country || '').toLowerCase().indexOf(q) >= 0 ||
          (v.director || '').toLowerCase().indexOf(q) >= 0 ||
          (v.genre || '').toLowerCase().indexOf(q) >= 0;
      });
    }
    
    /* Sort */
    if (TranslatedAppState.currentSort === 'views') {
      videos.sort(function(a, b) { return (b.views || 0) - (a.views || 0); });
    } else if (TranslatedAppState.currentSort === 'likes') {
      videos.sort(function(a, b) { return (b.likes || 0) - (a.likes || 0); });
    } else if (TranslatedAppState.currentSort === 'trending') {
      var now = Date.now();
      videos.sort(function(a, b) {
        var scoreA = (a.views || 0) + (a.likes || 0) * 5 + Math.max(0, 100000 - (now - (a.createdAt || 0))) / 1000;
        var scoreB = (b.views || 0) + (b.likes || 0) * 5 + Math.max(0, 100000 - (now - (b.createdAt || 0))) / 1000;
        return scoreB - scoreA;
      });
    } else {
      videos.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    }
    
    /* Return ALL videos - no pagination */
    return {
      videos: videos,
      hasMore: false, // Always false since we load everything
      lastKey: videos.length > 0 ? videos[videos.length - 1]._id : null,
      total: videos.length
    };
  });
}

/* =============================================
   Video Card
   ============================================= */
function createTranslatedVideoCard(v) {
  var id = v._id || '';
  var thumb = getThumbnailUrl(v);
  var title = v.title || 'Untitled Video';
  var desc = v.description || '';
  var views = formatNumber(v.views || 0);
  var likes = formatNumber(v.likes || 0);
  var dislikes = formatNumber(v.dislikes || 0);
  var country = v.country || '';
  var year = v.year || '';
  var genre = v.genre || '';
  var rated = v.rated || '';
  var imdbRating = v.imdbRating || '';
  var runtime = v.runtime || '';
  var director = v.director || '';
  var vjRaw = v.vjName || '';
  var vjName = vjRaw.replace('vj-', 'VJ ');
  var safeTitle = escapeHTML(title);
  var safeDesc = desc.length > 120 ? escapeHTML(desc.substring(0, 120)) + '...' : escapeHTML(desc);
  var isFav = AppState.favouriteVideos.indexOf(id) >= 0;

  var card = document.createElement('article');
  card.className = 'video-card';
  card.setAttribute('role', 'link');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', title);

  /* Meta badges */
  var metaBadges = '';
  if (year) metaBadges += '<span class="card-meta-year">' + escapeHTML(year) + '</span>';
  if (rated && rated !== 'N/A') metaBadges += '<span class="card-meta-rated">' + escapeHTML(rated) + '</span>';
  if (runtime && runtime !== 'N/A') metaBadges += '<span class="card-meta-runtime">' + escapeHTML(runtime) + '</span>';
  if (imdbRating && imdbRating !== 'N/A') metaBadges += '<span class="card-meta-imdb"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg> ' + escapeHTML(imdbRating) + '</span>';

  /* Genre */
  var genreDisplay = genre;
  if (genreDisplay.length > 40) genreDisplay = genreDisplay.substring(0, 40) + '...';
  var genreHTML = genre ? '<span class="card-meta-genre">' + escapeHTML(genreDisplay) + '</span>' : '';

  /* Director */
  var directorHTML = director ? '<span class="card-meta-genre">' + escapeHTML('Dir: ' + director) + '</span>' : '';

  /* Description */
  var descHTML = desc ? '<p class="video-card-desc">' + safeDesc + '</p>' : '';

  /* Country badge */
  var countryHTML = country ? '<span class="video-card-country">' + escapeHTML(country) + '</span>' : '';

  /* VJ name badge */
  var vjHTML = '';
  if (vjRaw) {
    vjHTML = '<div style="margin-bottom:6px;display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:rgba(230,57,70,0.1);border:1px solid rgba(230,57,70,0.2);border-radius:20px;font-size:0.75rem;font-weight:600;color:#e63946;">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="#e63946" stroke-width="2" width="13" height="13"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
      '<span>' + escapeHTML(vjName) + '</span>' +
      '</div>';
  }

  card.innerHTML =
    '<div class="video-card-thumb">' +
    '<img src="' + thumb + '" alt="' + safeTitle + '" loading="lazy" onerror="this.src=\'https://placehold.co/640x360/e63946/ffffff?text=No+Image\'">' +
    '<div class="video-card-overlay">' +
    '<div class="play-btn-overlay"><svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg></div>' +
    '<div class="card-actions">' +
    '<button class="card-action-btn fav-btn ' + (isFav ? 'active' : '') + '" data-id="' + id + '" title="Favourite">' +
    '<svg viewBox="0 0 24 24" fill="' + (isFav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
    '</button>' +
    '<button class="card-action-btn dl-btn" data-url="' + (v.videoUrl || '') + '" data-title="' + safeTitle + '" title="Download">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 8 12 3 17 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
    '</button>' +
    '</div>' +
    '</div>' +
    (runtime ? '<span class="video-card-duration">' + escapeHTML(runtime) + '</span>' : '') +
    '</div>' +
    '<div class="video-card-body">' +
    '<h3 class="video-card-title">' + safeTitle + '</h3>' +
    vjHTML +
    (metaBadges ? '<div class="card-meta-badges">' + metaBadges + '</div>' : '') +
    genreHTML +
    directorHTML +
    descHTML +
    '<div class="video-card-stats">' +
    countryHTML +
    '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ' + views + '</span>' +
    '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/></svg> ' + likes + '</span>' +
    '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/></svg> ' + dislikes + '</span>' +
    '</div>' +
    '</div>';

  /* Click to navigate to video.html */
  card.addEventListener('click', function(e) {
    if (e.target.closest('.card-action-btn')) return;
    window.location.href = 'video.html?id=' + id + '&source=translated';
  });
  card.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') window.location.href = 'video.html?id=' + id + '&source=translated';
  });

  /* Favourite button */
  var favBtn = card.querySelector('.fav-btn');
  if (favBtn) {
    favBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!AppState.currentUser) {
        showToast('Please sign in to add favourites', 'warning');
        return;
      }
      toggleFavourite(id);
      this.classList.toggle('active');
      var svg = this.querySelector('svg');
      if (svg) svg.setAttribute('fill', this.classList.contains('active') ? 'currentColor' : 'none');
    });
  }

  /* Download button */
  var dlBtn = card.querySelector('.dl-btn');
  if (dlBtn) {
    dlBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var url = this.dataset.url;
      if (!url) {
        showToast('Video not available for download', 'error');
        return;
      }
      handleFileDownload(url, this.dataset.title || 'video');
    });
  }

  return card;
}

/* =============================================
   Render Video Grid
   ============================================= */
function renderTranslatedVideos(append) {
  var grid = document.getElementById('videos-grid');
  var loadMoreContainer = document.getElementById('load-more-container');
  var noVideos = document.getElementById('no-videos');
  
  if (!grid) return;
  if (!append) grid.innerHTML = '';
  
  fetchTranslatedVideos(append).then(function(result) {
    if (result.videos.length === 0 && !append) {
      grid.innerHTML = '';
      if (noVideos) noVideos.style.display = 'block';
      if (loadMoreContainer) loadMoreContainer.style.display = 'none';
      return;
    }
    
    if (noVideos) noVideos.style.display = 'none';
    
    var fragment = document.createDocumentFragment();
    result.videos.forEach(function(v) {
      fragment.appendChild(createTranslatedVideoCard(v));
    });
    grid.appendChild(fragment);
    
    initLazyLoading();
    
    var badge = document.getElementById('video-count-badge');
    if (badge) badge.textContent = result.total + ' Translations';
    
    /* Always hide load more - everything is loaded */
    if (loadMoreContainer) loadMoreContainer.style.display = 'none';
  }).catch(function(err) {
    console.error('Translated fetch error:', err);
    if (!append) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h3>Could not load translations</h3><p>Please check your connection and try again.</p></div>';
    }
  });
}

/* =============================================
   Category Counts — reads from Translated/
   ============================================= */
function updateTranslatedCategoryCounts() {
  database.ref(TRANSLATED_FB_PATH).once('value').then(function(snapshot) {
    var allVideos = [];
    snapshot.forEach(function(child) {
      allVideos.push(child.val());
    });

    var setCount = function(id, count) {
      var el = document.getElementById(id);
      if (el) el.textContent = count;
    };

    setCount('count-all', allVideos.length);

    var categories = [
      'vj-junior', 'vj-jingo', 'vj-emmy', 'vj-ice-p', 'vj-mark', 'vj-kevo',
      'vj-hd', 'vj-silver', 'vj-heavy-q', 'vj-lance', 'vj-jimmy', 'vj-grade',
      'vj-ivo', 'vj-muba', 'vj-ulio', 'vj-kimuli', 'vj-banks', 'vj-tom',
      'vj-dan-de', 'vj-eddy', 'vj-ks', 'vj-henrico', 'vj-cabs', 'vj-fredy',
      'vj-baros', 'vj-jovan', 'vj-kevin', 'vj-nelly', 'vj-kriss', 'vj-soul'
    ];

    categories.forEach(function(cat) {
      var count = allVideos.filter(function(v) {
        return (v.vjName || '').toLowerCase() === cat;
      }).length;
      setCount('count-' + cat, count);
    });
  }).catch(function(err) {
    console.error('Category count error:', err);
  });
}

/* =============================================
   Popular Videos Widget
   ============================================= */
function renderTranslatedPopular() {
  var container = document.getElementById('popular-videos-widget');
  if (!container) return;

  fetchTranslatedVideos(false).then(function(result) {
    container.innerHTML = '';

    if (result.videos.length === 0) {
      container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">No translations yet.</p>';
      return;
    }

    var popular = result.videos.slice().sort(function(a, b) {
      return (b.views || 0) - (a.views || 0);
    });
    var top8 = popular.slice(0, 8);

    var fragment = document.createDocumentFragment();
    top8.forEach(function(v) {
      var vjName = (v.vjName || 'Unknown').replace('vj-', 'VJ ');

      var item = document.createElement('div');
      item.className = 'widget-video-item';
      item.style.cursor = 'pointer';

      item.innerHTML =
        '<div class="widget-video-thumb">' +
          '<img src="' + getThumbnailUrl(v) + '" alt="' + escapeHTML(v.title || 'Untitled') + '" onerror="this.src=\'https://placehold.co/100x64/e63946/fff?text=No+Image\'">' +
        '</div>' +
        '<div class="widget-video-info">' +
          '<h4>' + escapeHTML(v.title || 'Untitled') + '</h4>' +
          '<span class="widget-vj-name">' + escapeHTML(vjName) + '</span>' +
          '<span>' + formatNumber(v.views || 0) + ' views</span>' +
        '</div>';

      item.addEventListener('click', function() {
        window.location.href = 'video.html?id=' + v._id + '&source=translated';
      });

      fragment.appendChild(item);
    });

    container.appendChild(fragment);
    initLazyLoading();
  }).catch(function(err) {
    console.error('Popular widget error:', err);
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">Could not load.</p>';
  });
}
