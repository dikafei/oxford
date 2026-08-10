/**
 * Tour Data Reader - Vanilla JavaScript
 * Reads post_id and page_name from tour pages
 * 
 * @package ATG Oxford Helper
 * @since 1.0.1
 */

(function() {
    'use strict';

    /**
     * Tour Data Handler Object
     */
    const TourDataReader = {

        /**
         * Initialize the tour data reader
         */
        init: function() {
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', this.handleTourData.bind(this));
            } else {
                this.handleTourData();
            }
        },

        /**
         * Check if tour data exists and handle it
         */
        handleTourData: function() {
            // Check if tour data is available
            if (typeof window.atg_tour_data !== 'undefined' && window.atg_tour_data) {
                this.processTourData(window.atg_tour_data);
            } else {
                this.logMessage('No tour data found - not a tour page or data not loaded');
            }
        },

        /**
         * Process the tour data
         * @param {Object} tourData - The tour data object
         */
        processTourData: function(tourData) {
            const postId = tourData.post_id;
            const pageName = tourData.page_name;
            const isEscorted = tourData.is_escorted || false;

            // Base data object
            const processedData = {
                postId: postId,
                pageName: pageName,
                isEscorted: isEscorted
            };

            // Add pricing data if tour is escorted
            if (isEscorted && tourData.pricing_double !== undefined) {
                processedData.pricing = {
                    double: parseInt(tourData.pricing_double) || 0,
                    singleOccupancy: parseInt(tourData.pricing_single_occupancy) || 0,
                    twin: parseInt(tourData.pricing_twin) || 0
                };
            }

            // Log the data (remove in production if needed)
            this.logMessage('Tour Data Found:', processedData);

            // Store data for external access
            this.tourData = processedData;

            // Trigger custom events for other scripts to listen to
            this.triggerTourDataEvent(processedData);

            // Call custom handler (you can modify this)
            this.customTourDataHandler(processedData);
        },

        /**
         * Custom handler for tour data - modify this for your needs
         * @param {Object} tourData - The complete tour data object
         */
        customTourDataHandler: function(tourData) {
            const { postId, pageName, isEscorted, pricing } = tourData;

            // Example: Add tour classes and attributes to body
            if (document.body) {
                document.body.classList.add('tour-id-' + postId);
                document.body.setAttribute('data-tour-name', pageName);
                document.body.setAttribute('data-tour-escorted', isEscorted ? 'true' : 'false');
                
                if (isEscorted) {
                    document.body.classList.add('tour-escorted');
                } else {
                    document.body.classList.add('tour-independent');
                }
            }

            // Example: Store in sessionStorage for other pages
            if (typeof Storage !== 'undefined') {
                sessionStorage.setItem('current_tour_id', postId);
                sessionStorage.setItem('current_tour_name', pageName);
                sessionStorage.setItem('current_tour_escorted', isEscorted ? 'true' : 'false');
                
                if (isEscorted && pricing) {
                    sessionStorage.setItem('current_tour_pricing', JSON.stringify(pricing));
                }
            }

            // Add your custom logic here
            // Examples:
            // - Send analytics tracking with tour type
            // - Update form fields with pricing
            // - Show/hide pricing elements based on isEscorted
            // - API calls with tour ID and type

            // Call the custom user code block
            this.executeCustomCode(tourData);
        },

        /**
         * ========================================
         * CUSTOM CODE BLOCK - ADD YOUR CODE HERE
         * ========================================
         *
         * This is where you can add your custom JavaScript code.
         * The tourData object contains all tour information:
         * - tourData.postId (number)
         * - tourData.pageName (string)
         * - tourData.isEscorted (boolean)
         * - tourData.pricing (object, only if escorted)
         *   - tourData.pricing.double (number)
         *   - tourData.pricing.singleOccupancy (number)
         *   - tourData.pricing.twin (number)
         */
        executeCustomCode: function(tourData) {
            // =============================================
            // YOUR CUSTOM JAVASCRIPT CODE GOES HERE
            // =============================================
            
            // Example: Log tour information to console
            // console.log('Custom Code Block - Tour Data:', tourData);
            
            if (tourData.isEscorted) {
                // Update window.tripData with correct pricing so jetform-enhancement.js uses correct values
                if (typeof window.tripData !== 'undefined' && window.tripData) {
                    window.tripData.tripOptions = [{
                        double_room: tourData.pricing.double,
                        single_occupancy: tourData.pricing.singleOccupancy,
                        twin_room: tourData.pricing.twin,
                        trip_duration_label: "default_trip"
                    }];
                    window.tripData.tripMap = { "default_trip": 0 };
                }

                const selectRoom = document.querySelector('select[name="select_room"]');
                if (selectRoom) {
                    selectRoom.innerHTML = `
                        <option value="SelectRoom">Select Room</option>
                        <option value="0_double_room" data-price="${tourData.pricing.double}" data-room-type="double_room">Double Room - £${tourData.pricing.double}</option>
                        <option value="0_twin_room" data-price="${tourData.pricing.twin}" data-room-type="twin_room">Twin Room - £${tourData.pricing.twin}</option>
                        <option value="0_single_occupancy" data-price="${tourData.pricing.singleOccupancy}" data-room-type="single_occupancy">Single Occupancy (Double Room) - £${tourData.pricing.singleOccupancy}</option>
                    `;
                }
            }
            
            
            // ==============================================
            // END OF CUSTOM CODE BLOCK
            // ==============================================
        },

        /**
         * Trigger custom event with tour data
         * @param {Object} tourData - The complete tour data object
         */
        triggerTourDataEvent: function(tourData) {
            const event = new CustomEvent('tourDataLoaded', {
                detail: tourData
            });
            document.dispatchEvent(event);
        },

        /**
         * Get stored tour data (public method)
         * @returns {Object|null} Tour data or null if not available
         */
        getTourData: function() {
            return this.tourData || null;
        },

        /**
         * Get post ID (public method)
         * @returns {number|null} Post ID or null if not available
         */
        getPostId: function() {
            return this.tourData ? this.tourData.postId : null;
        },

        /**
         * Get page name (public method)
         * @returns {string|null} Page name or null if not available
         */
        getPageName: function() {
            return this.tourData ? this.tourData.pageName : null;
        },

        /**
         * Check if tour is escorted (public method)
         * @returns {boolean} True if escorted, false if independent or not available
         */
        isEscorted: function() {
            return this.tourData ? this.tourData.isEscorted : false;
        },

        /**
         * Get pricing data (public method)
         * @returns {Object|null} Pricing object or null if not available
         */
        getPricing: function() {
            return (this.tourData && this.tourData.pricing) ? this.tourData.pricing : null;
        },

        /**
         * Get specific pricing value (public method)
         * @param {string} type - Pricing type: 'double', 'singleOccupancy', or 'twin'
         * @returns {number|null} Price or null if not available
         */
        getPrice: function(type) {
            const pricing = this.getPricing();
            return pricing && pricing[type] !== undefined ? pricing[type] : null;
        },

        /**
         * Log message to console (only if console exists)
         * @param {string} message - Message to log
         * @param {*} data - Optional data to log
         */
        logMessage: function(message, data) {
            if (typeof console !== 'undefined' && console.log) {
                if (data) {
                    // console.log('[Tour Data Reader] ' + message, data);
                } else {
                    // console.log('[Tour Data Reader] ' + message);
                }
            }
        }
    };

    /**
     * Make TourDataReader globally accessible
     */
    window.TourDataReader = TourDataReader;

    /**
     * Auto-initialize
     */
    TourDataReader.init();

    /**
     * Example of how to listen for the custom event from other scripts:
     *
     * document.addEventListener('tourDataLoaded', function(e) {
     *     console.log('Tour ID:', e.detail.postId);
     *     console.log('Tour Name:', e.detail.pageName);
     *     console.log('Is Escorted:', e.detail.isEscorted);
     *
     *     if (e.detail.isEscorted && e.detail.pricing) {
     *         console.log('Double Room:', e.detail.pricing.double);
     *         console.log('Single Occupancy:', e.detail.pricing.singleOccupancy);
     *         console.log('Twin Room:', e.detail.pricing.twin);
     *     }
     * });
     *
     * // Example usage of public methods:
     * var tourData = TourDataReader.getTourData();
     * var isEscorted = TourDataReader.isEscorted();
     * var pricing = TourDataReader.getPricing();
     * var doublePrice = TourDataReader.getPrice('double');
     */

})();

document.addEventListener('DOMContentLoaded', function() {
    // Check if the query string contains the "status" variable
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('status')) {
        setTimeout(function() {
            // Find the first button with href containing "popup"
            const popupButton = document.querySelector('a.elementor-button[href*="popup"]');
            if (popupButton) {
                // Trigger a click on the button
                popupButton.click();
				// console.log("Popup Clicked");
            }

            // Hide the form with class "jet-form-builder"
            const form = document.querySelector('form.jet-form-builder');
            if (form) {
                form.style.display = 'none';
            }
            const statusValue = urlParams.get('status');
            const successMessageDiv = document.querySelector('div.jet-form-builder-message.jet-form-builder-message--success');
            if (successMessageDiv) {
                successMessageDiv.innerHTML = statusValue.replace(/^dsuccess\|/, '');
            }
        }, 5000); // Delay of 5 seconds
		
		
    }
	
    // Populate the Location/Hotel selects whenever a new row is added to the
    // "Itinerary" repeater (the "Add Your Stay" button on the customize form).
    //
    // Previously this relied on grabbing "the first .jet-form-builder__field-wrap
    // input found on the page" 500ms after opening the customize popup and
    // attaching onKeydown/onChange="populate_hotels()" to it - that only worked
    // by accident, back when the departure-date field happened to be first in
    // the DOM. The form has since gained fields earlier in the DOM (e.g. the
    // hidden number_of_passenger field), so that selector now grabs an unrelated
    // field and populate_hotels() never runs for customers. Listening directly
    // on the repeater's own "Add Your Stay" button is reliable regardless of
    // field order. Scoped to the "Itinerary" repeater specifically, since the
    // form also has a leftover hidden "Itinerary-old" repeater using the same
    // "Add Your Stay" button class.
    document.addEventListener('click', function(e) {
        const addRowButton = e.target.closest('.jet-form-builder-repeater__new');
        if (!addRowButton) return;

        const repeaterRoot = addRowButton.closest('[data-field-name="Itinerary"]');
        if (!repeaterRoot) return;

        setTimeout(populate_hotels, 100);
        setTimeout(syncItineraryRemoveButtonVisibility, 100);
    });

    setupItineraryAddRemoveButtons();
    buildAtgRouteMap();

    // Delegated on document (not bound to the individual stop buttons) -
    // the customize form's popup appears to clone/replace its content after
    // first insertion (likely an entrance animation), which would silently
    // drop any listeners attached directly to those buttons.
    document.addEventListener('click', function(e) {
        const stop = e.target.closest('form[data-form-id="31192"] .atg-route-map__stop');
        if (!stop) return;
        atgToggleRouteStop(stop.dataset.location, stop);
    });
});

/**
 * ================= ROUTE MAP (customize form) =================
 *
 * The Itinerary repeater used to let customers pick ANY location for ANY
 * row via a free dropdown, in any order - but the walking route only goes
 * one direction (e.g. Spoleto -> Scheggino -> Roccaporena -> Norcia ->
 * Castelluccio for this tour). Customers can skip a stop (e.g. take a bus
 * over a leg) but can't visit them out of order.
 *
 * Instead of the free dropdown, we show the route as a clickable line map
 * built from the tour's actual day-by-day order (the same data that already
 * feeds populate_hotels() via div.hotel_list_json). Clicking a stop toggles
 * it on/off ("lights up"); whichever stops are selected always render in
 * the map's fixed order in the repeater below, regardless of click order -
 * that's what makes "wrong order" impossible rather than something we have
 * to validate after the fact.
 *
 * The repeater itself has no native "reorder" operation, only "append a row"
 * / "remove a row". So on every toggle we fully rebuild the rows in the
 * correct order (remove all, re-add one per selected stop in route order),
 * restoring each stop's previously-entered Hotel/Nights from an in-memory
 * cache (keyed by location name, not row index) so toggling one stop
 * doesn't wipe out data already entered for other stops.
 */

const atgItineraryStopData = new Map(); // location name -> { hotel, nights }
const atgItinerarySelected = new Set(); // location names currently selected

function atgSleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

// Ordered, de-duplicated list of location names for this tour, derived from
// the same "hotel|location" pairs populate_hotels() already reads - first
// appearance order matches day order, since _days postmeta is walked in
// sequence when hotel_list_json is built server-side (frontend-data.php).
function atgGetRouteOrderedLocations() {
    const hotelListDiv = document.querySelector('div.hotel_list_json');
    if (!hotelListDiv) return [];

    let hotelData;
    try {
        hotelData = JSON.parse(hotelListDiv.textContent || '[]');
    } catch (e) {
        return [];
    }

    const seen = new Set();
    const ordered = [];
    hotelData.forEach(function(entry) {
        const parts = String(entry).split('|');
        if (parts.length < 2) return; // skip the "Select hotel" placeholder
        const location = parts[1].trim();
        if (!location || seen.has(location)) return;
        seen.add(location);
        ordered.push(location);
    });
    return ordered;
}

function buildAtgRouteMap() {
    if (document.querySelector('form[data-form-id="31192"] .atg-route-map')) return; // already built

    const repeaterField = document.querySelector('form[data-form-id="31192"] [data-field-name="Itinerary"]');
    if (!repeaterField) return;

    const fieldWrap = repeaterField.closest('.jet-form-builder__field-wrap') || repeaterField.parentElement;
    if (!fieldWrap) return;

    const locations = atgGetRouteOrderedLocations();
    if (!locations.length) return;

    const map = document.createElement('div');
    map.className = 'atg-route-map';
    locations.forEach(function(location, index) {
        const stop = document.createElement('button');
        stop.type = 'button';
        stop.className = 'atg-route-map__stop';
        stop.dataset.location = location;
        stop.innerHTML = '<span class="atg-route-map__dot"></span><span class="atg-route-map__label">' + location + '</span>';
        // Delegated (see the document-level click listener below) rather than
        // bound directly to this button - the popup framework appears to
        // clone/replace this markup after it's first inserted (an entrance
        // animation, most likely), which drops any listeners attached here
        // directly even though the elements look identical afterward.
        map.appendChild(stop);

        if (index < locations.length - 1) {
            const connector = document.createElement('span');
            connector.className = 'atg-route-map__connector';
            map.appendChild(connector);
        }
    });

    fieldWrap.insertBefore(map, fieldWrap.firstChild);

    // Shown while a rebuild is tearing down/re-adding rows, in place of the
    // repeater's rows (which get hidden via CSS) - covers up the native
    // remove-then-add flicker instead of the customer seeing rows vanish and
    // reappear one at a time.
    const loader = document.createElement('div');
    loader.className = 'atg-itinerary-loader';
    loader.innerHTML = '<span class="atg-itinerary-loader__spinner"></span><span>Updating your itinerary…</span>';
    repeaterField.insertAdjacentElement('afterend', loader);

    // Cache whatever the customer types into Hotel/Nights so it survives a
    // rebuild triggered by toggling a *different* stop. Delegated + scoped to
    // this repeater so it keeps working across rebuilds without re-binding.
    document.addEventListener('change', function(e) {
        const hotelSelect = e.target.closest('form[data-form-id="31192"] [data-field-name="Itinerary"] select[name*="[hotel_name]"]');
        if (!hotelSelect) return;
        const row = hotelSelect.closest('.jet-form-builder-repeater__row');
        const locSelect = row ? row.querySelector('select[name*="[hotel_location]"]') : null;
        if (!locSelect || !locSelect.value) return;
        const entry = atgItineraryStopData.get(locSelect.value) || {};
        entry.hotel = hotelSelect.value;
        atgItineraryStopData.set(locSelect.value, entry);
    });

    document.addEventListener('input', function(e) {
        const nightsInput = e.target.closest('form[data-form-id="31192"] [data-field-name="Itinerary"] input[name*="[nights_at_this_hotel]"]');
        if (!nightsInput) return;
        const row = nightsInput.closest('.jet-form-builder-repeater__row');
        const locSelect = row ? row.querySelector('select[name*="[hotel_location]"]') : null;
        if (!locSelect || !locSelect.value) return;
        const entry = atgItineraryStopData.get(locSelect.value) || {};
        entry.nights = nightsInput.value;
        atgItineraryStopData.set(locSelect.value, entry);
    });
}

// Rebuilds tear the repeater's rows down and back up over several hundred ms
// (waiting on populate_hotels()'s own delay each time). If the customer clicks
// two stops in quick succession, a second rebuild can start while the first is
// still removing/re-adding rows, and the two interleave and corrupt each other.
// Queue rebuilds so they always run one at a time, in click order - each one
// reads atgItinerarySelected fresh when it actually runs, so only the final
// state needs to be correct, not every intermediate one.
let atgRebuildQueue = Promise.resolve();

function atgToggleRouteStop(location, stopEl) {
    if (atgItinerarySelected.has(location)) {
        atgItinerarySelected.delete(location);
        stopEl.classList.remove('selected');
    } else {
        atgItinerarySelected.add(location);
        stopEl.classList.add('selected');
    }
    atgRebuildQueue = atgRebuildQueue.then(atgRebuildItineraryRows).catch(function(err) {
        // Never let one failed rebuild permanently wedge the queue - without
        // this, every click after an error would silently no-op forever.
        console.error('atg route map rebuild failed:', err);
    });
}

// Polls conditionFn() every intervalMs until it returns a truthy value or
// timeoutMs elapses; returns that value (or null on timeout). Used instead of
// fixed sleeps when driving the native repeater, since populate_hotels()'s own
// internal delay (and the page's overall responsiveness) isn't perfectly
// consistent - waiting for an actual DOM signal (row count changed, select
// marked .processed) is far more reliable than guessing a duration.
async function atgWaitFor(conditionFn, timeoutMs, intervalMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const result = conditionFn();
        if (result) return result;
        await atgSleep(intervalMs || 40);
    }
    return null;
}

async function atgRebuildItineraryRows() {
    const formSelector = 'form[data-form-id="31192"] [data-field-name="Itinerary"]';
    const rowSelector = formSelector + ' .jet-form-builder-repeater__row';

    // Hide the rows and show a loader for the duration of the rebuild -
    // without this the customer sees every row vanish and then reappear one
    // at a time as we tear the repeater down and rebuild it.
    const repeaterField = document.querySelector(formSelector);
    const loader = document.querySelector('form[data-form-id="31192"] .atg-itinerary-loader');
    const itemsContainer = document.querySelector(formSelector + ' .jet-form-builder-repeater__items');

    // Reserve the rows' current height on the loader before hiding them, so
    // the popup goes straight from "old content height" to "new content
    // height" once, instead of collapsing down to the loader's small size
    // and then jumping again when the new rows appear - that double jump is
    // what made this feel so jarring.
    if (loader && itemsContainer && itemsContainer.offsetHeight > 0) {
        loader.style.minHeight = itemsContainer.offsetHeight + 'px';
    }

    if (repeaterField) repeaterField.classList.add('atg-rebuilding');
    if (loader) loader.classList.add('active');

    // 1. Remove every existing row (order doesn't matter for removal, only
    // for re-adding). Wait for the row count to actually drop before moving
    // on, rather than assuming a fixed delay is enough.
    let guard = 0;
    let rows = document.querySelectorAll(rowSelector);
    while (rows.length && guard < 50) {
        const targetCount = rows.length - 1;
        const lastRemove = rows[rows.length - 1].querySelector('.jet-form-builder-repeater__remove');
        if (!lastRemove) break;
        lastRemove.click();
        await atgWaitFor(function() {
            return document.querySelectorAll(rowSelector).length === targetCount;
        }, 3000, 30);
        rows = document.querySelectorAll(rowSelector);
        guard++;
    }

    // 2. Re-add one row per selected stop, in fixed route order.
    const orderedSelected = atgGetRouteOrderedLocations().filter(function(loc) {
        return atgItinerarySelected.has(loc);
    });

    for (const location of orderedSelected) {
        const addBtn = document.querySelector('form[data-form-id="31192"] .jet-form-builder-repeater__new');
        if (!addBtn) break;

        const beforeCount = document.querySelectorAll(rowSelector).length;
        addBtn.click();

        await atgWaitFor(function() {
            return document.querySelectorAll(rowSelector).length === beforeCount + 1;
        }, 3000, 30);

        // The page's own click listener also calls populate_hotels() after a
        // short delay to fill in the new row's Location/Hotel options - but
        // it's occasionally unreliable under rapid programmatic clicks here,
        // so call it directly too rather than trust that chain alone.
        // populate_hotels() only touches :not(.processed) selects, so a
        // duplicate call is harmless.
        populate_hotels();

        const rowsNow = document.querySelectorAll(rowSelector);
        const newRow = rowsNow[rowsNow.length - 1];
        if (!newRow) continue;

        const locSelect = newRow.querySelector('select[name*="[hotel_location]"]');
        const hotelSelect = newRow.querySelector('select[name*="[hotel_name]"]');
        const nightsInput = newRow.querySelector('input[name*="[nights_at_this_hotel]"]');

        // populate_hotels() marks the location/hotel selects "processed" once
        // it has finished building their <option> lists - wait for that
        // before setting a value, or the value can get lost when the options
        // are (re)built out from under it.
        await atgWaitFor(function() {
            return locSelect && locSelect.classList.contains('processed');
        }, 3000, 30);

        if (locSelect) {
            locSelect.value = location;
            locSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const cached = atgItineraryStopData.get(location);
        if (cached && cached.hotel && hotelSelect) {
            hotelSelect.value = cached.hotel;
            hotelSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (cached && cached.nights && nightsInput) {
            nightsInput.value = cached.nights;
            nightsInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    syncItineraryRemoveButtonVisibility();
    atgUpdateLocationLabels(orderedSelected);

    if (repeaterField) repeaterField.classList.remove('atg-rebuilding');
    if (loader) {
        loader.classList.remove('active');
        loader.style.minHeight = ''; // let it size naturally again next time
    }
}

// JetFormBuilder labels each row "Location 1", "Location 2"... via a
// per-row <style> block it injects itself (a ::before rule keyed off the
// row's [data-index]). We can't edit generated content via textContent since
// it's a pseudo-element, so instead inject our own override rule per row
// (scoped + !important so it wins regardless of injection order) showing the
// actual place name instead of a generic index.
function atgUpdateLocationLabels(orderedSelected) {
    let styleEl = document.getElementById('atg-location-labels');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'atg-location-labels';
        document.head.appendChild(styleEl);
    }

    const css = orderedSelected.map(function(location, index) {
        const safeLocation = location.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return 'form[data-form-id="31192"] [data-field-name="Itinerary"] .jet-form-builder-repeater__row[data-index="' + index + '"] .location-display::before { content: "' + safeLocation + '" !important; }';
    }).join('\n');

    styleEl.textContent = css;
}

/**
 * Show/hide the shared "Remove" button added by setupItineraryAddRemoveButtons()
 * based on whether any Location rows currently exist. Always re-queries fresh
 * from the document rather than relying on any cached element reference -
 * JetFormBuilder appears to rebuild parts of the repeater's DOM at some point
 * after the page loads (e.g. when the popup first opens), which silently
 * detached an earlier MutationObserver-based version of this check bound to
 * a now-stale container reference, leaving the Remove button stuck hidden
 * even with rows present.
 */
function syncItineraryRemoveButtonVisibility() {
    const removeBtn = document.querySelector('form[data-form-id="31192"] .jet-itinerary-remove-btn');
    if (!removeBtn) return;
    const rows = document.querySelectorAll('form[data-form-id="31192"] [data-field-name="Itinerary"] .jet-form-builder-repeater__row');
    removeBtn.style.display = rows.length > 0 ? 'flex' : 'none';
}

/**
 * Give the customize form's "Add Your Stay" button the same "+" icon as the
 * main booking form's "Add Room" button, and add a matching shared "Remove"
 * button (with the same "-" icon) next to it - instead of JetFormBuilder's
 * default one-"x"-per-row remove button pinned to the top-right corner of
 * each Location block. The shared Remove button always removes the
 * last-added Location row, exactly like "Remove Room" always removes the
 * last-added room on the main form.
 *
 * Deliberately does NOT reuse the main form's .add-room-btn/.remove-room-btn
 * classes - those have their own document-level click handler (duplicateRoom()/
 * removeLatestRoom()) tied to the *Room* fields, and giving the Itinerary
 * buttons the same classes would trigger that unrelated logic too.
 */
function setupItineraryAddRemoveButtons() {
    const PLUS_ICON = '<svg class="wsf-section-icon" focusable="false" viewBox="0 0 16 16" style="display:block;height:18px;max-width:100%;"><path d="M13.7 2.3C12.1.8 10.1 0 8 0S3.9.8 2.3 2.3 0 5.9 0 8s.8 4.1 2.3 5.7S5.9 16 8 16s4.1-.8 5.7-2.3S16 10.1 16 8s-.8-4.1-2.3-5.7zM8 14.8c-3.7 0-6.8-3-6.8-6.8s3-6.8 6.8-6.8 6.8 3 6.8 6.8-3.1 6.8-6.8 6.8zm.6-7.4h2.8v1.2H8.6v2.8H7.4V8.6H4.6V7.4h2.8V4.6h1.2v2.8z"></path></svg>';
    const MINUS_ICON = '<svg class="wsf-section-icon" focusable="false" viewBox="0 0 16 16" style="display:block;height:18px;max-width:100%;"><path d="M8 16c-2.1 0-4.1-.8-5.7-2.3S0 10.1 0 8s.8-4.1 2.3-5.7S5.9 0 8 0s4.1.8 5.7 2.3S16 5.9 16 8s-.8 4.1-2.3 5.7S10.1 16 8 16zM8 1.2c-3.7 0-6.8 3-6.8 6.8s3 6.8 6.8 6.8 6.8-3 6.8-6.8S11.7 1.2 8 1.2zm3.4 6.2H4.6v1.2h6.9V7.4z"></path></svg>';

    const addBtn = document.querySelector('form[data-form-id="31192"] .jet-form-builder-repeater__new');
    if (!addBtn || addBtn.dataset.atgIconAdded) return;
    addBtn.dataset.atgIconAdded = '1';

    // Icon + label span, matching Add Room's markup structure
    addBtn.innerHTML = PLUS_ICON + '<span class="jet-itinerary-add-btn__label">' + addBtn.textContent.trim() + '</span>';

    const actionsBar = addBtn.parentElement; // .jet-form-builder-repeater__actions
    if (!actionsBar) return;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'jet-itinerary-remove-btn';
    removeBtn.innerHTML = MINUS_ICON + '<span class="jet-itinerary-remove-btn__label">Remove</span>';
    removeBtn.style.display = 'none'; // nothing to remove until a row exists
    actionsBar.appendChild(removeBtn);

    removeBtn.addEventListener('click', function() {
        const rows = document.querySelectorAll('form[data-form-id="31192"] [data-field-name="Itinerary"] .jet-form-builder-repeater__row');
        const lastRow = rows[rows.length - 1];
        if (!lastRow) return;
        // Delegate the actual removal to JetFormBuilder's own (hidden) per-row
        // remove button, rather than reimplementing its repeater internals.
        const lastRowRemove = lastRow.querySelector('.jet-form-builder-repeater__remove');
        if (lastRowRemove) lastRowRemove.click();
        setTimeout(syncItineraryRemoveButtonVisibility, 100);
    });

    syncItineraryRemoveButtonVisibility();
}



function populate_hotels(){
    setTimeout(function() {
        // Find the div with class "hotel_list_json"
        const hotelListDiv = document.querySelector('div.hotel_list_json');
        if (hotelListDiv) {
            // Get the contents of the div and parse it as JSON
            const hotelData = JSON.parse(hotelListDiv.textContent || '[]');
			// console.log("Hotel Data is :", hotelData);
			
			
            // Find the select element with name containing "hotel_location" that does not have "processed" class
               // 🔹 Select all hotel_location fields that are not processed yet
            const locationSelects = document.querySelectorAll('select[name*="[hotel_location]"]:not(.processed)');
            const hotelSelects = document.querySelectorAll('select[name*="[hotel_name]"]:not(.processed)');

            locationSelects.forEach((hotelSelect, index) => {
                const hotelSelect2 = hotelSelects[index]; // pair by index (same repeater row)

                if (!hotelSelect || !hotelSelect2) return;

                // ---- populate locations
                const seen = new Set();
                hotelData.forEach(hotel => {
                    let [a, b] = hotel.split("|");
                    if (!a || !b) return;
                    b = b.trim();
                    if (seen.has(b)) return;
                    seen.add(b);

                    const option = document.createElement('option');
                    option.value = b;
                    option.textContent = b;
                    hotelSelect.appendChild(option);
                });

                // ---- prepare hotel select
                hotelSelect2.innerHTML = "";
                const placeholder = document.createElement('option');
                placeholder.value = "";
                placeholder.textContent = "Select hotel";
                hotelSelect2.appendChild(placeholder);

                // ---- event listener for location → filter hotels
                hotelSelect.addEventListener('change', () => {
                    const selectedLocation = hotelSelect.value;
                    hotelSelect2.innerHTML = "";

                    const placeholder = document.createElement('option');
                    placeholder.value = "";
                    placeholder.textContent = "Select hotel";
                    hotelSelect2.appendChild(placeholder);

                    const seenHotels = new Set();
                    hotelData.forEach(hotel => {
                        let [a, b] = hotel.split("|");
                        if (!a || !b) return;
                        a = a.trim();
                        b = b.trim();

                        if (b === selectedLocation && !seenHotels.has(a)) {
                            seenHotels.add(a);
                            const option = document.createElement('option');
                            option.value = a;
                            option.textContent = a;
                            hotelSelect2.appendChild(option);
                        }
                    });
                    hotelSelect2.selectedIndex = 0;
                });

                // ---- cleanup empty/whitespace options
                [hotelSelect, hotelSelect2].forEach(select => {
                    Array.from(select.options).forEach(opt => {
                        if (!opt.value.trim() && !opt.textContent.trim()) {
                            opt.remove();
                        }
                    });
                    select.selectedIndex = -1;
                });

                // mark processed so same select is not re-processed
                hotelSelect.classList.add('processed');
                hotelSelect2.classList.add('processed');
            });
        }

        let mapRoomTypeToNumOfPeople = {
            'single'    : 1,
            'double'    : 2,
            'twin'      : 2
        };
        document.querySelectorAll('select[name^="Itinerary["][name$="[roomType1]"]').forEach(select => {
            select.addEventListener('change', e => {
                const parentRow = e.target.closest('.jet-form-builder-repeater__row');
                if (!parentRow) return;
                const numPeopleInput = parentRow.querySelector('input[data-field-name="numPeople1"]');
                if (numPeopleInput) {
                    numPeopleInput.value = mapRoomTypeToNumOfPeople[e.target.value];
                    const hiddenInputField = parentRow.querySelector('input.hiddenForOnePassenger');
                    const hiddenInputWrapper = hiddenInputField.closest('.wp-block-column');
                    if(hiddenInputWrapper){
                        hiddenInputWrapper.style.display = mapRoomTypeToNumOfPeople[e.target.value] > 1 ? 'block' : 'none';
                    }
                    numPeopleInput.dispatchEvent(new Event('input', { bubbles: true }));
                    numPeopleInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });

        document.querySelectorAll('input.hiddenForOnePassenger').forEach(input => {
            const parent = input.closest('.wp-block-column');
            if(parent){
                parent.style.display = 'none';
            }
        });

    }, 500);
}