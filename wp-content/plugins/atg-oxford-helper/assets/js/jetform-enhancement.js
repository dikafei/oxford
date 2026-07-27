document.addEventListener('DOMContentLoaded', function () {

    // Adjust the selector if your repeater wrapper has a custom class
    const repeater = document.querySelector('.jet-form-builder-repeater');
    if (!repeater) return;

    function updateHeadings() {
        repeater.querySelectorAll('.jet-form-builder-repeater__item').forEach(item => {
            const heading = item.querySelector('.location-heading');
            const index  = item.dataset.index; // "0", "1", "2", ...
            if (heading && index !== undefined) {
                heading.textContent = 'LOCATION ' + (parseInt(index, 10) + 1);
            }
        });
    }

    // Run on page load
    updateHeadings();

    // Re-run whenever JetForm adds or removes items
    const observer = new MutationObserver(updateHeadings);
    observer.observe(repeater, { childList: true });

});

// Native <input type="date"> fields (used when a trip has no blocked_dates /
// departure_escorted data to drive the custom Flatpickr picker further below -
// e.g. _departure rendered plain by JetFormBuilder) only open the browser's
// calendar picker from the small calendar icon in some browsers (Firefox,
// Safari). Clicking anywhere in the field should open it, so trigger
// showPicker() on click. Has no effect on trips where the custom datepicker
// takes over, since that logic hides this input (display: none) instead.
document.addEventListener('click', function(e) {
    const dateInput = e.target.closest('input[type="date"]');
    if (dateInput && !dateInput.disabled && !dateInput.readOnly && typeof dateInput.showPicker === 'function') {
        try {
            dateInput.showPicker();
        } catch (err) {
            // showPicker() throws if called outside a user gesture or while already open - ignore
        }
    }
});

// Format any date-ish string as dd/mm/yyyy for display. Handles "2025-09-18",
// "2025-09-18T00:00", and already-formatted "18/09/2025" (passthrough).
// Used everywhere a date is shown to the user, so the site has one consistent format.
// Defined at top level (not inside the flatpickr-gated IIFE below) so it's always
// available even if Flatpickr somehow fails to load.
window.atgFormatDDMMYYYY = function(dateStr) {
    if (!dateStr) return dateStr;
    dateStr = String(dateStr).trim();

    // Already dd/mm/yyyy - leave as-is
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        return dateStr;
    }

    // Strip time portion if present
    const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;

    // ISO yyyy-mm-dd
    const isoMatch = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }

    // Fallback: try native Date parsing
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
        const day = String(parsed.getDate()).padStart(2, '0');
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}/${parsed.getFullYear()}`;
    }

    return dateStr;
};

// Format a number as GBP with thousands separators, e.g. 2140 -> "£2,140.00".
// Used everywhere a price/deposit/total is displayed to the user. Only touches
// display text, never the underlying form field .value used for calculations.
window.atgFormatCurrency = function(amount) {
    const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.-]/g, ''));
    if (isNaN(num)) return '£0.00';
    return '£' + num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

(function() {
    // Check if we've already initialized to prevent duplicate execution
    if (window.jetformDatepickerInitialized) {
        return;
    }
    window.jetformDatepickerInitialized = true;
    
    // Check if Flatpickr is loaded
    if (typeof flatpickr === 'undefined') {
        // Flatpickr is not available
        return;
    }
    
    // Store configuration globally
    window.jetformDatepickerConfig = {
        dateRanges: [],
        blockedDates: [],
        flatpickrInstances: new Map(),
        processedInputs: new Set(), // Track which inputs we've already processed
        datepickerCreated: false // Track if datepicker has been created
    };
	
	
    
    // Process date ranges from departure_escorted field
    function processDateRangesField() {
        const dateRangesField = document.querySelector('input[name="departure_escorted"][data-dynamic-value]');
        if (!dateRangesField) {
            // console.log("No departure_escorted field found");
            return false;
        }
        
        const rawData = dateRangesField.getAttribute("data-dynamic-value");
        
        if (!rawData) {
            // console.log("No data-dynamic-value found");
            return false;
        }
        
        let parsedData;
        try {
            const decoded = rawData.replace(/&quot;/g, '"');
            parsedData = JSON.parse(decoded);
        } catch (e) {
            // Error parsing departure_escorted data
            return false;
        }

        // Look for the rule with to_set array
        const rule = parsedData.find(r => r.to_set && Array.isArray(r.to_set));
        if (!rule || !rule.to_set || rule.to_set.length === 0) {
            // console.log("No valid date ranges found");
            return false;
        }
        
        // Extract date ranges
        window.jetformDatepickerConfig.dateRanges = rule.to_set;
        
        return true;
    }
    
    // Process blocked dates from blocked_dates field
    function processBlockedDatesField() {
        const blockedDatesField = document.querySelector('input[name="blocked_dates"][data-dynamic-value]');
        if (!blockedDatesField) {
            // console.log("No blocked_dates field found");
            return false;
        }
        
        const rawData = blockedDatesField.getAttribute("data-dynamic-value");
        
        if (!rawData) {
            // console.log("No data-dynamic-value found");
            return false;
        }
        
        let parsedData;
        try {
            const decoded = rawData.replace(/&quot;/g, '"');
            parsedData = JSON.parse(decoded);
        } catch (e) {
            // Error parsing blocked_dates data
            return false;
        }

        // Look for the rule with to_set array
        const rule = parsedData.find(r => r.to_set && Array.isArray(r.to_set));
        if (!rule || !rule.to_set || rule.to_set.length === 0) {
            // console.log("No valid blocked dates found");
            return false;
        }
        
        // Extract blocked date ranges
        window.jetformDatepickerConfig.blockedDates = rule.to_set;

        
        return true;
    }
    
    // Function to check if field has specific dates (should use dropdown)
    function hasDateRanges() {
        return window.jetformDatepickerConfig.dateRanges.length > 0;
    }
    
    // Function to check if field has blocked dates (should use datepicker)
    function hasBlockedDates() {
        return window.jetformDatepickerConfig.blockedDates.length > 0;
    }
    
    // Function to format date ranges for display
    function formatDateRange(startDateStr, endDateStr) {
        // Handle both date formats: "2025-09-18" and "2025-09-18T00:00"
        if (startDateStr.includes('T')) {
            startDateStr = startDateStr.split('T')[0];
        }
        if (endDateStr.includes('T')) {
            endDateStr = endDateStr.split('T')[0];
        }

        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

        // Fix invalid end dates (like "2025-09-15" coming after "2025-10-10")
        let displayStartDate = startDate;
        let displayEndDate = endDate;

        if (endDate < startDate) {
            // Swap dates if end date is before start date
            displayStartDate = endDate;
            displayEndDate = startDate;
        }

        const formattedStart = window.atgFormatDDMMYYYY(displayStartDate.toISOString().split('T')[0]);
        const formattedEnd = window.atgFormatDDMMYYYY(displayEndDate.toISOString().split('T')[0]);

        return `${formattedStart} to ${formattedEnd}`;
    }
    
    // Function to generate blocked dates for Flatpickr
    function generateBlockedDatesForFlatpickr(blockedRanges) {
        const disabledDates = [];
        
        blockedRanges.forEach(range => {
            // Handle both date formats: "2025-09-18" and "2025-09-18T00:00"
            let startDateStr = range.start_date;
            let endDateStr = range.end_date;
            
            // Remove time portion if present
            if (startDateStr.includes('T')) {
                startDateStr = startDateStr.split('T')[0];
            }
            if (endDateStr.includes('T')) {
                endDateStr = endDateStr.split('T')[0];
            }
            
            let startDate = new Date(startDateStr);
            let endDate = new Date(endDateStr);
            
            // Fix invalid end dates
            if (endDate < startDate) {
                [startDate, endDate] = [endDate, startDate];
            }
            
            // Generate all dates in the range
            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                disabledDates.push(currentDate.toISOString().split('T')[0]);
                currentDate.setDate(currentDate.getDate() + 1);
            }
        });
        
        // Remove duplicates
        return [...new Set(disabledDates)];
    }
    
    // Function to create dropdown for date ranges
    function createDropdownForDateRanges(input) {
        if (window.jetformDatepickerConfig.dateRanges.length === 0) {
            return false;
        }
        
        // Hide the original input completely
        input.style.display = 'none';
        
        // Create a select dropdown
        const select = document.createElement('select');
        select.name = input.name;
        select.id = input.id + '_select';
        select.className = 'jet-form-builder__field date-select';
        select.style.width = '100%';
        select.style.padding = '8px';
        select.style.marginTop = '5px';
        select.required = input.required;
        
        // Add a default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a Date';
        defaultOption.disabled = false;
        defaultOption.hidden = true;
        defaultOption.selected = true;
        select.appendChild(defaultOption);
        
        // Add options for each date range
        window.jetformDatepickerConfig.dateRanges.forEach(range => {
            const option = document.createElement('option');
            option.value = range.start_date.split('T')[0]; // Use the start date as value
            option.textContent = formatDateRange(range.start_date, range.end_date);
            select.appendChild(option);
        });
        
        // Set the value if already selected
        if (input.value) {
            const matchingRange = window.jetformDatepickerConfig.dateRanges.find(
                r => r.start_date.split('T')[0] === input.value
            );
            if (matchingRange) {
                select.value = matchingRange.start_date.split('T')[0];
                defaultOption.selected = false;
            }
        }
        
        // Update the hidden input when selection changes
        select.addEventListener('change', function() {
            input.value = this.value;
            
            // Trigger change event on the original input for form validation
            const event = new Event('change', { bubbles: true });
            input.dispatchEvent(event);
        });
        
        // Add the select after the input
        input.parentNode.insertBefore(select, input.nextSibling);
        
        return true;
    }
    
    // Function to initialize date picker when popup opens
    function initializeDatepickerWhenReady() {
        // Use event delegation for the entire document
        document.addEventListener('click', function(e) {
            // Check if the click is on our custom datepicker elements
            const target = e.target;
            
            if (target.classList.contains('custom-datepicker-input') || 
                target.classList.contains('jetform-calendar-icon') ||
                target.closest('.jetform-datepicker-container')) {
                
                e.preventDefault();
                e.stopPropagation();
                
              
                // Find the closest container
                const container = target.closest('.jetform-datepicker-container');
                if (!container) return;
                
                // Find the fake input
                const fakeInput = container.querySelector('.custom-datepicker-input');
                if (!fakeInput) return;
                
                // Find the original input
                const originalInput = container.previousElementSibling;
                if (!originalInput || !originalInput.name.includes('departure')) return;
                
                // Initialize or open Flatpickr
                initFlatpickrForElement(fakeInput, originalInput);
            }
        });
        
        // Also use a more specific observer for popup content
        const popupObserver = new MutationObserver(function(mutations) {
            let shouldInitialize = false;
            
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length > 0) {
                    // Check if the popup contains our form
                    const departureInputs = document.querySelectorAll('input[name="_departure"]');
                    const hasDateRanges = window.jetformDatepickerConfig.dateRanges.length > 0;
                    const hasBlockedDates = window.jetformDatepickerConfig.blockedDates.length > 0;
                    
                    if (departureInputs.length > 0 && (hasDateRanges || hasBlockedDates) && !window.jetformDatepickerConfig.datepickerCreated) {
                        shouldInitialize = true;
                    }
                }
            });
            
            if (shouldInitialize) {
                createCustomDatePicker();
                window.jetformDatepickerConfig.datepickerCreated = true;
                
                // Disconnect the observer after successful creation
                popupObserver.disconnect();
            }
        });
        
        // Observe the entire document for popup content
        popupObserver.observe(document.body, { 
            childList: true, 
            subtree: true
        });
        
        // Also check immediately in case popup is already open
        setTimeout(function() {
            const departureInputs = document.querySelectorAll('input[name="_departure"]');
            const hasDateRanges = window.jetformDatepickerConfig.dateRanges.length > 0;
            const hasBlockedDates = window.jetformDatepickerConfig.blockedDates.length > 0;
            
            if (departureInputs.length > 0 && (hasDateRanges || hasBlockedDates) && !window.jetformDatepickerConfig.datepickerCreated) {
                
                createCustomDatePicker();
                window.jetformDatepickerConfig.datepickerCreated = true;
                
                // Disconnect the observer after successful creation
                popupObserver.disconnect();
            }
        }, 1500);
    }
    
    // Start the initialization process
    
    if (document.querySelector('input[name="departure_escorted"][data-dynamic-value]') || 
        document.querySelector('input[name="blocked_dates"][data-dynamic-value]')) {
        
        // Process both fields if they exist
        let hasDateRanges = false;
        let hasBlockedDates = false;
        
        if (document.querySelector('input[name="departure_escorted"][data-dynamic-value]')) {
          
            hasDateRanges = processDateRangesField();
        }
        
        if (document.querySelector('input[name="blocked_dates"][data-dynamic-value]')) {
            
            hasBlockedDates = processBlockedDatesField();
        }
        
        if (hasDateRanges || hasBlockedDates) {
            
            initializeDatepickerWhenReady();
        } else {
            // console.log("No valid data found in fields");
        }
    } else {
        
        // Wait for fields to be added dynamically (when popup opens)
        const fieldObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length > 0) {
                    let hasDateRanges = false;
                    let hasBlockedDates = false;
                    
                    if (document.querySelector('input[name="departure_escorted"][data-dynamic-value]')) {
                        
                        hasDateRanges = processDateRangesField();
                    }
                    
                    if (document.querySelector('input[name="blocked_dates"][data-dynamic-value]')) {
                        
                        hasBlockedDates = processBlockedDatesField();
                    }
                    
                    if (hasDateRanges || hasBlockedDates) {
                       
                        initializeDatepickerWhenReady();
                        fieldObserver.disconnect();
                    }
                }
            });
        });
        
        fieldObserver.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
    }
    
    // Function to initialize Flatpickr for a specific element
    function initFlatpickrForElement(fakeInput, originalInput) {
        const instanceId = originalInput.id;

        // Check if we already have an instance for this input
        if (window.jetformDatepickerConfig.flatpickrInstances.has(instanceId)) {
            const instance = window.jetformDatepickerConfig.flatpickrInstances.get(instanceId);

            // Check if the instance's element is still the same element in the DOM
            // If the modal was closed and reopened, the elements are recreated and the old instance is stale
            if (instance.element === fakeInput && document.body.contains(fakeInput)) {
                instance.open();
                return;
            } else {
                // Destroy the stale instance and create a new one
                instance.destroy();
                window.jetformDatepickerConfig.flatpickrInstances.delete(instanceId);
            }
        }
        
        
        
        // Generate disabled dates if we have blocked dates
        let disabledDates = [];
        if (window.jetformDatepickerConfig.blockedDates.length > 0) {
            disabledDates = generateBlockedDatesForFlatpickr(window.jetformDatepickerConfig.blockedDates);
            
        }

        const flatpickrInstance = flatpickr(fakeInput, {
            dateFormat: "d/m/Y",
            disableMobile: true,
            allowInput: false,
            clickOpens: true,
            defaultDate: originalInput.value || null,
            disable: disabledDates,
            minDate: "today",
            onReady: function(selectedDates, dateStr, instance) {
                
                
                // Set initial value if exists
                if (originalInput.value) {
                    fakeInput.value = originalInput.value;
                }
                
                // Store instance for later access
                window.jetformDatepickerConfig.flatpickrInstances.set(instanceId, instance);
                
                // OPEN IMMEDIATELY on first click
                setTimeout(() => {
                    instance.open();
                }, 50);
            },
            onChange: function(selectedDates, dateStr, instance) {
               
                if (selectedDates.length > 0) {
                    // Update the hidden input value
                    originalInput.value = dateStr;
                    fakeInput.value = dateStr;
                    
                    // Trigger change event for form validation
                    const event = new Event('change', { bubbles: true });
                    originalInput.dispatchEvent(event);
                }
            },
            onOpen: function(selectedDates, dateStr, instance) {
                
                // Fix z-index for popup
                setTimeout(() => {
                    if (instance.calendarContainer) {
                        instance.calendarContainer.style.zIndex = '9999999';
                        instance.calendarContainer.style.position = 'fixed';
                    }
                }, 10);
            }
        });
    }
    
    // Create a completely custom date picker solution
    function createCustomDatePicker() {
        // Get only the main departure input, not the hidden ones
        const dateInputs = document.querySelectorAll('input[name="_departure"]');
      
        
        if (dateInputs.length === 0) {
        
            return;
        }
        
        dateInputs.forEach(input => {
           
            
            // Skip if already processed (using our global tracking)
            if (window.jetformDatepickerConfig.processedInputs.has(input.id)) {
                
                return;
            }
            
            // Skip if this is a hidden field (like departure_escorted)
            if (input.type === 'hidden' || input.name !== '_departure') {
               
                return;
            }
            
            // Mark as processed in our global tracking
            window.jetformDatepickerConfig.processedInputs.add(input.id);
            
            
            // Check if this field has date ranges (should use dropdown) - PRIORITY 1
            if (hasDateRanges()) {
                
                if (createDropdownForDateRanges(input)) {
                  
                    return; // Skip datepicker creation
                }
            }
            
            // Check if this field has blocked dates (should use datepicker) - PRIORITY 2
            if (hasBlockedDates()) {
              
                
                // Hide the original input completely
                input.style.display = 'none';
                
                // Create a custom date picker container
                const container = document.createElement('div');
                container.style.position = 'relative';
                container.style.width = '100%';
                container.classList.add('jetform-datepicker-container');
                
                // Create a fake input for display
                const fakeInput = document.createElement('input');
                fakeInput.type = 'text';
                fakeInput.className = 'jet-form-builder__field custom-datepicker-input';
                fakeInput.style.width = '100%';
                fakeInput.style.padding = '8px';
                fakeInput.style.paddingRight = '30px';
                fakeInput.style.cursor = 'pointer';
                fakeInput.style.backgroundColor = '#fff';
                fakeInput.placeholder = 'Select date';
                fakeInput.readOnly = true;
                
                // Set initial value if exists
                if (input.value) {
                    fakeInput.value = input.value;
                }
                
                // Create calendar icon
                const calendarIcon = document.createElement('span');
                calendarIcon.innerHTML = '📅';
                calendarIcon.style.position = 'absolute';
                calendarIcon.style.right = '10px';
                calendarIcon.style.top = '50%';
                calendarIcon.style.transform = 'translateY(-50%)';
                calendarIcon.style.cursor = 'pointer';
                calendarIcon.style.zIndex = '1000';
                calendarIcon.classList.add('jetform-calendar-icon');
                
                // Add elements to container
                container.appendChild(fakeInput);
                container.appendChild(calendarIcon);
                
                // Insert after the original input
                input.parentNode.insertBefore(container, input.nextSibling);
                
               
            } else {
                // console.log("No date ranges or blocked dates found for:", input.id);
            }
        });
    }
})();

document.addEventListener("DOMContentLoaded", function () {
    // console.log("DOMContentLoaded - Trip Booking System Initializing");
	
	jQuery(document).ready(function($) {
    	function updateRepeaterHeadings() {
        	$('#jet-form-builder__form-31192 .jet-form-builder-repeater__item').each(function(index) {
            	var $item = $(this);
            	var locationNumber = index + 1;
            	var $heading = $item.find('.location-heading');
            
            	var headingHtml = `
                	<div class="location-heading" style="
                    	background: #f8f9fa;
                    	padding: 15px 20px;
                    	margin: -15px -15px 20px -15px;
                    	border-left: 4px solid #007cba;
                    	font-size: 18px;
                    	font-weight: bold;
                    	color: #2c3e50;
                    	border-bottom: 1px solid #e9ecef;
                	">Location ${locationNumber}</div>
            	`;
            
            	if ($heading.length) {
                	$heading.text('Location ' + locationNumber);
            	} else {
                	$item.prepend(headingHtml);
            	}
        	});
    	}
    
    	// Initial numbering
    	updateRepeaterHeadings();
    
    	// Update when new items are added/removed
    	$(document).on('click', '.jet-form-builder-repeater__new-item, .jet-form-builder-repeater__remove-item', function() {
        	setTimeout(updateRepeaterHeadings, 100);
    	});
	});

    const today = new Date().toISOString().split("T")[0];
    document.querySelectorAll(".block_past_dates").forEach(input => {
        input.setAttribute("min", today);
    });

    // Store trip data
    window.tripData = {
        tripOptions: null,
        tripMap: {},
        selectedTripIndex: null,
        additionalRoomsCount: 0,
    };

    // Parse trip options from either the room field or hidden pricing fields
    function getTripOptions() {
        // console.log("Getting trip options...");
        
        // First try to get data from the room field
        const roomFieldWrapper = document.querySelector('[data-update-field-name="select_room"]');
        if (roomFieldWrapper) {
            // console.log("Found room field wrapper");
            const rawData = roomFieldWrapper.getAttribute("data-value");
            if (rawData) {
                // console.log("Raw data found in room field:", rawData.substring(0, 100) + "...");
                try {
                    const decoded = rawData.replace(/&quot;/g, '"');
                    const parsed = JSON.parse(decoded);
                    // console.log("Parsed room field data:", parsed);
                    
                    // Find a rule with valid to_set data
                    const rule = parsed.find(r => r.to_set && r.to_set !== "" && r.to_set !== "[]");
                    // console.log("Found rule:", rule);

                    if (rule && rule.to_set) {
                        // console.log("Rule to_set value:", rule.to_set);
                        
                        // Check if to_set is a valid array of room options
                        let roomOptions;
                        if (typeof rule.to_set === "object") {
                            roomOptions = rule.to_set;
                        } else {
                            try {
                                roomOptions = JSON.parse(rule.to_set);
                            } catch (e) {
                                // Error parsing to_set as JSON
                                roomOptions = null;
                            }
                        }
                        
                        // Only return if we have valid room options
                        if (roomOptions && Array.isArray(roomOptions) && roomOptions.length > 0) {
                            // console.log("Returning room options from room field");
                            return roomOptions;
                        } else {
                            // console.log("Room field has empty or invalid room options, falling back to pricing fields");
                        }
                    } else {
                        // console.log("No valid rule found in room field, falling back to pricing fields");
                    }
                } catch (e) {
                    // Error parsing trip options from room field
                }
            } else {
                // console.log("No data-value attribute found in room field");
            }
        } else {
            // console.log("Room field wrapper not found");
        }

        // If room field data is not available or invalid, try to get from hidden pricing fields
        // console.log("Looking for fallback pricing fields...");
        const doublePriceField = document.querySelector('input[name="_pricing"]');
        const singlePriceField = document.querySelector('input[name="_pricing_single_occupancy"]');
        const twinPriceField = document.querySelector('input[name="_pricing_twin"]');

        // console.log("Double price field:", doublePriceField);
        // console.log("Single price field:", singlePriceField);
        // console.log("Twin price field:", twinPriceField);

        if (doublePriceField) console.log("Double price value:", doublePriceField.value);
        if (singlePriceField) console.log("Single price value:", singlePriceField.value);
        if (twinPriceField) console.log("Twin price value:", twinPriceField.value);

        if (doublePriceField || singlePriceField || twinPriceField) {
            // Create a basic trip option from the available pricing fields
            const tripOption = {
                double_room: doublePriceField ? doublePriceField.value.replace(',', '') : "",
                single_occupancy: singlePriceField ? singlePriceField.value.replace(',', '') : "",
                twin_room: twinPriceField ? twinPriceField.value.replace(',', '') : "",
                trip_duration_label: "default_trip" // Default label
            };

            // console.log("Created trip option from pricing fields:", tripOption);
            return [tripOption];
        }

        // No trip pricing data found
        return null;
    }

    // Initialize trip data
    window.tripData.tripOptions = getTripOptions();
    // console.log("Final trip options:", window.tripData.tripOptions);
    
    if (!window.tripData.tripOptions || !Array.isArray(window.tripData.tripOptions)) {
        const roomMain = document.querySelector('.room_main');
        if (roomMain) {
            roomMain.style.display = 'none';
            // console.log("Hiding room main section due to no valid trip options");
        }
        // No valid trip options found
        return;
    }

    // Build map of trip labels → index
    window.tripData.tripOptions.forEach((trip, index) => {
        if (trip.trip_duration_label) {
            window.tripData.tripMap[trip.trip_duration_label] = index;
            // console.log(`Mapped trip label '${trip.trip_duration_label}' to index ${index}`);
        } else if (index === 0) {
            // If no label, use a default one for the first trip
            window.tripData.tripMap["default_trip"] = index;
            // console.log(`Using default trip label for index ${index}`);
        }
    });

    // console.log("Trip map:", window.tripData.tripMap);

    // Get passenger limits based on room type
    function getPassengerLimits(roomType) {
        // console.log("Getting passenger limits for room type:", roomType);
        switch(roomType) {
            case "double_room":
            case "double_upgrade":
                return { min: 2, max: 2, default: 2 };
            case "twin_room":
            case "twin_room_upgrade":
                return { min: 2, max: 2, default: 2 };
            case "single_occupancy":
            case "single_occupancy_upgrade":
                return { min: 1, max: 1, default: 1 };
            default:
                return { min: 1, max: 10, default: 1 };
        }
    }

    // Update passenger input based on selected room
    function updatePassengerInputLimits(roomSelect, passengerInput) {
        // console.log("Updating passenger input limits");
        if (!roomSelect || !passengerInput) return;
        
        const selectedOption = roomSelect.options[roomSelect.selectedIndex];
        if (!selectedOption) return;
        
        // Extract room type from option value
        const roomType = selectedOption.value.split('_').slice(1).join('_');
        // console.log("Room type from option:", roomType);
        const limits = getPassengerLimits(roomType);
        // console.log("Passenger limits:", limits);
        
        // Set min, max, and always force the value to match the room type - the field
        // is hidden from the customer now, so passenger count is fully automatic:
        // double/twin (incl. upgrades) is always 2, single occupancy is always 1.
        passengerInput.min = limits.min;
        passengerInput.max = limits.max;
        passengerInput.value = limits.default;

        // Trigger input event so subtotal/deposit/passenger-name fields recalculate
        const inputEvent = new Event('input', { bubbles: true });
        passengerInput.dispatchEvent(inputEvent);

        // Add validation message
        if (!passengerInput.dataset.originalTitle) {
            passengerInput.dataset.originalTitle = passengerInput.title || '';
        }
        passengerInput.title = `${passengerInput.dataset.originalTitle} (Min: ${limits.min}, Max: ${limits.max})`;
        
        // Remove any existing validation
        if (passengerInput._inputValidationAttached) {
            passengerInput.removeEventListener('input', passengerInput._inputHandler);
            passengerInput.removeEventListener('blur', passengerInput._blurHandler);
        }
        
        passengerInput.addEventListener('input', passengerInput._inputHandler);
        passengerInput.addEventListener('blur', passengerInput._blurHandler);
        
        passengerInput._inputValidationAttached = true;
    }

    // Populate room select
    function populateRoomOptions(tripIndex) {
        // console.log('populateRoomOptions for trip index:', tripIndex);
        const trip = window.tripData.tripOptions[tripIndex];
        if (!trip) {
            // No trip found for index
            return;
        }

        // console.log("Trip data:", trip);

        const roomSelect = document.querySelector('select[name="select_room"]');
        const passengerInput = document.querySelector('input[name="number_of_passenger"]');
        if (!roomSelect || !passengerInput) {
            // Room select or passenger input not found
            return;
        }

        roomSelect.innerHTML = '<option value="" selected disabled>Select Room</option>';

        const roomTypes = [
            { key: "double_room", label: "Double Room" },
            { key: "twin_room", label: "Twin Room" },
            { key: "single_occupancy", label: "Single Occupancy (Double Room)" },
            { key: "double_upgrade", label: "Double Room (Upgrade)" },
            { key: "twin_room_upgrade", label: "Twin Room (Upgrade)" },
            { key: "single_occupancy_upgrade", label: "Single Occupancy (Double Room) (Upgrade)" }
        ];

        // console.log("Available room types to check:", roomTypes);

        let optionsAdded = 0;
        roomTypes.forEach(roomType => {
            // console.log(`Checking ${roomType.key}:`, trip[roomType.key]);
            if (trip[roomType.key] && trip[roomType.key] !== "") {
                const option = document.createElement("option");
                option.value = `${tripIndex}_${roomType.key}`;
                option.textContent = `${roomType.label} - £${trip[roomType.key]} per person`;
                option.dataset.price = trip[roomType.key];
                option.dataset.roomType = roomType.key;
                roomSelect.appendChild(option);
                optionsAdded++;
                // console.log(`Added option: ${option.textContent}`);
            }
        });

        // console.log("Final room select options count:", optionsAdded);
        
        if (optionsAdded === 0) {
            // No room options were added to the select
            roomSelect.innerHTML = '<option value="" selected disabled>No room options available</option>';
        }
		
		 passengerInput.value = '';
        
        window.tripData.selectedTripIndex = tripIndex;
        initializeCalculation();
    }

    // Init calculation + passenger fields
    function initializeCalculation() {
        // console.log("Initializing calculation");
        const roomSelect = document.querySelector('select[name="select_room"]');
        const passengerInput = document.querySelector('input[name="number_of_passenger"]');
        const subtotalInput = document.querySelector('input[name="sub_total"]');

        if (!roomSelect || !passengerInput || !subtotalInput) {
            // Required elements not found for calculation
            return;
        }

        // Don't attach direct listeners to roomSelect - use event delegation instead
        if (!passengerInput._subtotalAttached) {
            passengerInput.addEventListener("input", calculateSubtotal);
            passengerInput._subtotalAttached = true;
        }
        if (!passengerInput._generateAttached) {
            passengerInput.addEventListener("input", generatePassengerFields);
            passengerInput._generateAttached = true;
        }

        if (passengerInput.value && parseInt(passengerInput.value) > 0) {
            generatePassengerFields();
        }
    }

    // Use event delegation for main room select changes (Chrome compatibility)
    document.addEventListener('change', function(e) {
        if (e.target.matches('select[name="select_room"]')) {
            const roomSelect = e.target;
            const passengerInput = document.querySelector('input[name="number_of_passenger"]');
            if (roomSelect && passengerInput) {
                updatePassengerInputLimits(roomSelect, passengerInput);
                calculateSubtotal();
                generatePassengerFields();
            }
        }
    });

    // Calculate subtotal
    function calculateSubtotal() {
        // console.log("Calculating subtotal");
        const roomSelect = document.querySelector('select[name="select_room"]');
        const passengerInput = document.querySelector('input[name="number_of_passenger"]');
        const subtotalInput = document.querySelector('input[name="sub_total"]');

        if (!roomSelect || !passengerInput || !subtotalInput) return;

        const selectedOption = roomSelect.options[roomSelect.selectedIndex];
        const passengers = parseInt(passengerInput.value) || 0;

        // console.log("Selected option:", selectedOption);
        // console.log("Passengers:", passengers);

        if (selectedOption && selectedOption.dataset.price && passengers > 0) {
            const roomPrice = parseFloat(selectedOption.dataset.price);
            const subtotal = roomPrice * passengers;
            subtotalInput.value = window.atgFormatCurrency(subtotal);
            // console.log("Calculated subtotal: £" + subtotal.toFixed(2));

            // Trigger input event for deposit calculation
            const inputEvent = new Event('input', { bubbles: true });
            subtotalInput.dispatchEvent(inputEvent);
        } else {
            subtotalInput.value = "";
            // console.log("Cleared subtotal - missing selection or passengers");

            // Trigger input event even when cleared
            const inputEvent = new Event('input', { bubbles: true });
            subtotalInput.dispatchEvent(inputEvent);
        }
    }

    // Generate passenger fields
    function generatePassengerFields() {
        // console.log("Generating passenger fields");
        const passengerInput = document.querySelector('input[name="number_of_passenger"]');
        const passengers = parseInt(passengerInput.value) || 0;
        const passengerFieldsContainer = document.querySelector(".passangerfields");

        if (!passengerFieldsContainer) {
            // Passenger fields container not found
            return;
        }

        let passengerContainer = passengerFieldsContainer.querySelector(".passenger-details-container");

        if (passengers === 0) {
            // console.log("No passengers, removing container if exists");
            if (passengerContainer) passengerContainer.remove();
            if (window.updatePassengerDataText) window.updatePassengerDataText();
            return;
        }

        if (!passengerContainer) {
            // console.log("Creating new passenger container");
            passengerContainer = document.createElement("div");
            passengerContainer.className = "passenger-details-container";
            passengerFieldsContainer.appendChild(passengerContainer);
        }

        passengerContainer.innerHTML = "";
        passengerContainer.innerHTML = "<h4>Passenger Details</h4>";

        // console.log("Generating fields for", passengers, "passengers");

        for (let i = 1; i <= passengers; i++) {
            const passengerSection = document.createElement("div");
            passengerSection.className = "passenger-section";

            passengerSection.innerHTML = `
                <div class="jet-form-col">
                    <label>Title *</label>
                    <input type="text" name="passenger_title_${i}" required>
                </div>
                <div class="jet-form-col">
                    <label>First Name *</label>
                    <input type="text" name="passenger_first_name_${i}" required>
                </div>
                <div class="jet-form-col">
                    <label>Last Name *</label>
                    <input type="text" name="passenger_last_name_${i}" required>
                </div>
            `;

            passengerContainer.appendChild(passengerSection);
        }

        // console.log("Passenger fields generated");

        if (window.updatePassengerDataText) window.updatePassengerDataText();
    }
    
    function updatePopupTitle(buttonId) {
        // console.log("Updating popup title with button ID:", buttonId);
        // Find the heading element in the popup
        const titleElement = document.querySelector('.atg-for-selectroom');
        const hiddenField = document.querySelector('input[name="triptitle"]');
        if (hiddenField && buttonId !== null) {
            const formattedTitlen = formatTitleText(buttonId);

            hiddenField.value = formattedTitlen;
            // console.log("Set hidden field value:", formattedTitlen);

            // Trigger change event for form validation
            const changeEvent = new Event('change', { bubbles: true });
            hiddenField.dispatchEvent(changeEvent);
        }
        if (titleElement && buttonId) {
            // Convert button ID to a more readable format
            const formattedTitle = formatTitleText(buttonId);
            
            // Update the title text
            titleElement.textContent = formattedTitle;
            titleElement.style.display = "block";
            // console.log("Set title element text:", formattedTitle);
        } else {
            titleElement.textContent = " ";
            // console.log("Cleared title element");
        }
    }

    function formatTitleText(buttonId){
        return buttonId.split('–')[0].trim().split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // ================= FIXED DEPOSIT ===================
    // Deposit is a flat amount per person - independent vs escorted trips have their
    // own rate - rather than a percentage of the total price. All the figures below
    // (deposit rates, promo code, discount %, and whether the promo discounts the
    // deposit too) are editable under Settings > ATG Booking Settings in wp-admin,
    // and come through on window.atg_tour_data. The literals here are only a
    // last-resort fallback in case that data hasn't loaded for some reason.
    function getDepositPerPassenger() {
        const data = window.atg_tour_data || {};
        const isEscorted = !!data.is_escorted;
        const rate = isEscorted ? data.atg_deposit_escorted : data.atg_deposit_independent;
        const parsed = parseFloat(rate);
        if (!isNaN(parsed) && parsed >= 0) {
            return parsed;
        }
        return isEscorted ? 500 : 200;
    }

    function getPromoSettings() {
        const data = window.atg_tour_data || {};

        const code = (data.atg_promo_code || 'ATG10').toString().trim().toUpperCase();

        let discountFraction = 0.1;
        const parsedPercent = parseFloat(data.atg_promo_discount_percent);
        if (!isNaN(parsedPercent) && parsedPercent >= 0) {
            discountFraction = parsedPercent / 100;
        }

        const appliesToDeposit = !!(data.atg_promo_discount_applies_to_deposit && data.atg_promo_discount_applies_to_deposit !== '0');

        return { code: code, discountFraction: discountFraction, appliesToDeposit: appliesToDeposit };
    }

    function isPromoCodeActive(promoCodeValue, total) {
        const promo = getPromoSettings();
        return (promoCodeValue || '').toString().trim().toUpperCase() === promo.code && total > 0;
    }

    function getTotalPassengerCount() {
        let count = 0;

        const mainInput = document.querySelector('input[name="number_of_passenger"]');
        if (mainInput) {
            count += parseInt(mainInput.value) || 0;
        }

        document.querySelectorAll('input[name^="number_of_passenger_"]').forEach(function(input) {
            count += parseInt(input.value) || 0;
        });

        return count;
    }

    function calculateFixedDeposit(isPromoActive) {
        let deposit = getTotalPassengerCount() * getDepositPerPassenger();

        if (isPromoActive) {
            const promo = getPromoSettings();
            if (promo.appliesToDeposit) {
                deposit = deposit * (1 - promo.discountFraction);
            }
        }

        return deposit.toFixed(2);
    }

    // Builds the "Deposit Due: £400 (£200 x 2 passengers)" label text. The £200 is
    // getDepositPerPassenger() (independent vs escorted rate, editable under Settings >
    // ATG Booking Settings) - never hardcoded - and the count is the live passenger total.
    function buildDepositLabelHtml(depositValue) {
        const rate = getDepositPerPassenger();
        const count = getTotalPassengerCount();
        const passengerWord = count === 1 ? 'passenger' : 'passengers';
        return 'Deposit Due: ' + window.atgFormatCurrency(depositValue) +
            ' (' + window.atgFormatCurrency(rate) + ' x ' + count + ' ' + passengerWord + ')';
    }

    // Passenger text sync setup
    function setupFormSyncIfPresent() {
        const form = document.querySelector("form.jet-form-builder");
        if (!form) {
            return;
        }

        if (form.dataset.passengerSync === "true") {
            // console.log("Form sync already set up");
            return;
        }

        let passengerField = form.querySelector('input[name="passenger_data"]');
        if (!passengerField) {
            // console.log("Creating passenger data field");
            passengerField = document.createElement("input");
            passengerField.type = "hidden";
            passengerField.name = "passenger_data";
            passengerField.className = "jet-form-builder__field hidden-field";
            form.appendChild(passengerField);
        }

        window.updatePassengerDataText = function () {
            // console.log("Updating passenger data text");
            const lines = [];
            const container = form.querySelector(".passangerfields") || document.querySelector(".passangerfields");
            if (!container) {
                passengerField.value = "";
                // console.log("No container found, cleared passenger field");
                return;
            }

            const sections = container.querySelectorAll(".passenger-section");
            // console.log("Found", sections.length, "passenger sections");
            
            sections.forEach((section, index) => {
                const i = index + 1;
                const title = section.querySelector(`[name="passenger_title_${i}"]`)?.value || "";
                const firstName = section.querySelector(`[name="passenger_first_name_${i}"]`)?.value || "";
                const lastName = section.querySelector(`[name="passenger_last_name_${i}"]`)?.value || "";

                if(i > 1) lines.push(` & Passenger ${i}: ${title} ${firstName} ${lastName}`);
                else lines.push(`Passenger ${i}: ${title} ${firstName} ${lastName}`);
            });

            // Also capture passenger data from additional rooms
            const additionalRooms = document.querySelectorAll('.additional-room');
            // console.log("Found", additionalRooms.length, "additional rooms");
            
            additionalRooms.forEach((room, roomIndex) => {
                const roomPassengerContainer = room.querySelector('.passenger-details-container');
                if (roomPassengerContainer) {
                    const roomSections = roomPassengerContainer.querySelectorAll(".passenger-section");
                    roomSections.forEach((section, index) => {
                        const i = index + 1;
                        const roomNum = roomIndex + 1;
                        const title = section.querySelector(`[name^="passenger_title_${roomNum}_"]`)?.value || "";
                        const firstName = section.querySelector(`[name^="passenger_first_name_${roomNum}_"]`)?.value || "";
                        const lastName = section.querySelector(`[name^="passenger_last_name_${roomNum}_"]`)?.value || "";

                        lines.push(` + Additional Room ${roomNum} - Passenger ${i}: ${title} ${firstName} ${lastName}`);
                    });
                }
            });

            passengerField.value = lines.join("\n");
            // console.log("Updated passenger data field with", lines.length, "lines");

            // Trigger change event for form validation
            const changeEvent = new Event('change', { bubbles: true });
            passengerField.dispatchEvent(changeEvent);
        };

        const handler = function (e) {
            if (!e.target || !e.target.name) return;
            const name = e.target.name;
            if (
                name.startsWith("passenger_title_") ||
                name.startsWith("passenger_first_name_") ||
                name.startsWith("passenger_last_name_") ||
                name === "number_of_passenger"
            ) {
                // console.log("Input changed, updating passenger data:", name);
                e.target.classList.remove("field-error");
                window.updatePassengerDataText();
            }

            // Update deposit whenever passenger counts change (including additional rooms).
            // Deposit is a fixed amount per passenger, not a percentage of price.
            if (name === "sub_total" || name.startsWith("sub_total_") || name === "select_room" || name.startsWith("select_room_") || name === "number_of_passenger" || name.startsWith("number_of_passenger_")) {
                const depositInput = form.querySelector('input[name="deposit"]');
                const depositFieldLabel = document.querySelector('.custom-deposit-field .jet-form-builder__label-text');
                if (depositInput) {
                    const subtotalInputsForPromo = form.querySelectorAll('input[name="sub_total"], input[name^="sub_total_"]');
                    let totalForPromo = 0;
                    subtotalInputsForPromo.forEach(function(input) {
                        totalForPromo += parseFloat(input.value.replace(/[^0-9.]/g, '')) || 0;
                    });
                    const promoInput = form.querySelector('input[name="promo_code"]');
                    const promoActive = isPromoCodeActive(promoInput ? promoInput.value : '', totalForPromo);

                    const depositValue = calculateFixedDeposit(promoActive);
                    depositInput.value = depositValue;
                    if(depositFieldLabel){
                        depositFieldLabel.innerHTML = buildDepositLabelHtml(depositValue);
                    }
                    // Trigger change event for compatibility
                    const changeEvent = new Event('change', { bubbles: true });
                    depositInput.dispatchEvent(changeEvent);

                    // console.log("Deposit updated to:", depositValue);
                }
            }
        };

        form._passengerHandler = handler;
        form.addEventListener("input", handler);
        form.addEventListener("change", handler);

        const nextBtns = form.querySelectorAll(".jet-form-builder__next-page");
        nextBtns.forEach(nextBtn => {
            if (nextBtn) {
                nextBtn.addEventListener("click", function(e) {
                    let isValid = true
                    const currentPage = e.target.closest(".jet-form-builder-page");
                    if (currentPage) {
                        const requiredFields = currentPage.querySelectorAll("[required]");
                        requiredFields.forEach(field => {
                            if (!field.value.trim()) {
                                field.classList.add("field-error");
                                isValid = false;
                            }
                            else {
                                field.classList.remove("field-error");
                            }
                        });
                    }
                    if (!isValid) {
                        e.stopImmediatePropagation();
                        e.preventDefault();
                        return false;
                    }
                    // Summary rendering is handled by generateCompleteSummary(), wired to
                    // this same button via the deposit-calculator click listener below.
                }, true);
            }
        });

        initializeCalculation();
        window.updatePassengerDataText();

        form.dataset.passengerSync = "true";
        // console.log("Form sync setup complete");
    }

    // MutationObserver for popup/form load
    const observer = new MutationObserver(function (mutations) {
        // console.log("Mutation observed", mutations.length, "changes");
        let shouldTrySetup = false;
        for (const m of mutations) {
            if (m.addedNodes && m.addedNodes.length) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.matches && node.matches("form.jet-form-builder")) shouldTrySetup = true;
                    if (node.querySelector && node.querySelector("form.jet-form-builder")) shouldTrySetup = true;
                    if (node.querySelector && node.querySelector(".passangerfields")) shouldTrySetup = true;
                }
            }

            if (m.type === "attributes" && (m.attributeName === "class" || m.attributeName === "style")) {
                if (m.target && (m.target.matches && m.target.matches("form.jet-form-builder"))) shouldTrySetup = true;
                if (m.target && m.target.querySelector && m.target.querySelector("form.jet-form-builder")) shouldTrySetup = true;
            }
        }

        if (shouldTrySetup) {
            // console.log("Mutation requires setup, trying in 30ms");
            setTimeout(setupFormSyncIfPresent, 30);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    setTimeout(setupFormSyncIfPresent, 50);

    document.addEventListener("elementor/popup/show", function () {
        // console.log("Elementor popup shown");
        if (window.tripData.selectedTripIndex !== null) {
            const tripLabel = Object.keys(window.tripData.tripMap).find(
                key => window.tripData.tripMap[key] === window.tripData.selectedTripIndex
            );
            if (tripLabel) {
                updatePopupTitle(tripLabel);
            }
            setTimeout(function () {
                populateRoomOptions(window.tripData.selectedTripIndex);
            }, 500);
        } else if (window.tripData.tripOptions && window.tripData.tripOptions.length > 0) {
            // If no specific trip is selected but we have options, use the first one
            // console.log("Using default trip for popup");
            window.tripData.selectedTripIndex = 0;
            const tripLabel = Object.keys(window.tripData.tripMap)[0];
            if (tripLabel) {
                updatePopupTitle(tripLabel);
            }
            setTimeout(function () {
                populateRoomOptions(0);
            }, 500);
        }
        setTimeout(setupFormSyncIfPresent, 50);
    });

    // Clean up flatpickr instances when modal closes
    document.addEventListener("elementor/popup/hide", function () {
        // console.log("Elementor popup hidden - cleaning up flatpickr instances");
        if (window.jetformDatepickerConfig && window.jetformDatepickerConfig.flatpickrInstances) {
            window.jetformDatepickerConfig.flatpickrInstances.forEach((instance, key) => {
                instance.destroy();
            });
            window.jetformDatepickerConfig.flatpickrInstances.clear();
            window.jetformDatepickerConfig.datepickerCreated = false;
        }
    });

    // Initialize simple flatpickr for expected_departure field
    function initializeExpectedDepartureDatepicker() {
        // Use MutationObserver to watch for the field
        const observer = new MutationObserver(function(mutations) {
            const expectedDepartureInput = document.querySelector('input#expected_departure');

            if (expectedDepartureInput && !expectedDepartureInput._flatpickrInitialized) {
                // console.log("Found expected_departure input, initializing flatpickr");

                // Get tomorrow's date
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);

                const instance = flatpickr(expectedDepartureInput, {
                    dateFormat: "d/m/Y",
                    minDate: tomorrow,
                    disableMobile: true,
                    allowInput: false,
                    clickOpens: true,
                    onReady: function(selectedDates, dateStr, instance) {
                        // console.log("Expected departure datepicker ready");

                        // Store instance for cleanup
                        const instanceId = 'expected_departure';
                        window.jetformDatepickerConfig.flatpickrInstances.set(instanceId, instance);
                    },
                    onOpen: function(selectedDates, dateStr, instance) {
                        // Fix z-index for popup
                        setTimeout(() => {
                            if (instance.calendarContainer) {
                                instance.calendarContainer.style.zIndex = '9999999';
                                instance.calendarContainer.style.position = 'fixed';
                            }
                        }, 10);
                    }
                });

                expectedDepartureInput._flatpickrInitialized = true;
                // console.log("Expected departure flatpickr initialized");
            }
        });

        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Also check immediately in case field already exists
        setTimeout(function() {
            const expectedDepartureInput = document.querySelector('input#expected_departure');
            if (expectedDepartureInput && !expectedDepartureInput._flatpickrInitialized) {
                // console.log("Expected_departure already exists, initializing");

                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);

                const instance = flatpickr(expectedDepartureInput, {
                    dateFormat: "d/m/Y",
                    minDate: tomorrow,
                    disableMobile: true,
                    allowInput: false,
                    clickOpens: true,
                    onReady: function(selectedDates, dateStr, instance) {
                        // console.log("Expected departure datepicker ready");

                        const instanceId = 'expected_departure';
                        window.jetformDatepickerConfig.flatpickrInstances.set(instanceId, instance);
                    },
                    onOpen: function(selectedDates, dateStr, instance) {
                        setTimeout(() => {
                            if (instance.calendarContainer) {
                                instance.calendarContainer.style.zIndex = '9999999';
                                instance.calendarContainer.style.position = 'fixed';
                            }
                        }, 10);
                    }
                });

                expectedDepartureInput._flatpickrInitialized = true;
            }
        }, 100);
    }

    // Initialize expected_departure datepicker
    initializeExpectedDepartureDatepicker();

    document.addEventListener("click", function (e) {
        const button = e.target.closest("a.elementor-button") || e.target.closest("button");
        // alert('test');
        if (button && button.id) {
            // console.log("Button clicked with ID:", button.id);
            const tripIndex = window.tripData.tripMap[button.id];
            if (tripIndex !== undefined) {
                // console.log("Found trip index for button:", tripIndex);
                window.tripData.selectedTripIndex = tripIndex;
                window.tripData.name = tripIndex;
                updatePopupTitle(button.id);
                setTimeout(function () {
                    populateRoomOptions(tripIndex);
                }, 1000);
            } else {
                // console.log("No trip index found for button ID:", button.id);
            }
        }
    });

    // ================= ADDITIONAL ROOMS ===================
    function waitForElement(selector, timeout = 5000) {
        // console.log("Waiting for element:", selector);
        return new Promise((resolve, reject) => {
            const interval = 50;
            let elapsed = 0;
            const check = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) {
                    clearInterval(check);
                    // console.log("Element found:", selector);
                    resolve(el);
                }
                elapsed += interval;
                if (elapsed >= timeout) {
                    clearInterval(check);
                    // console.log("Element not found within timeout:", selector);
                    reject(null);
                }
            }, interval);
        });
    }

    async function addAdditionalRoomButton() {
        // console.log("Adding additional room button");
        try {
            const container = await waitForElement(".additionalfields .wp-block-column");

            // Check if buttons already exist
            if (container.querySelector(".add-room-btn")) {
                // console.log("Additional room buttons already exist");
                return;
            }

            // Create button container
            const buttonContainer = document.createElement("div");
            buttonContainer.className = "additional-room-buttons";

            // Add Room button
            const addBtn = document.createElement("button");
            addBtn.type = "button";
            addBtn.className = "add-room-btn";
            addBtn.innerHTML = `<svg class="wsf-section-icon" focusable="false" viewBox="0 0 16 16" style="display: block; height: auto; max-width: 100%;height: 18px;"><path d="M13.7 2.3C12.1.8 10.1 0 8 0S3.9.8 2.3 2.3 0 5.9 0 8s.8 4.1 2.3 5.7S5.9 16 8 16s4.1-.8 5.7-2.3S16 10.1 16 8s-.8-4.1-2.3-5.7zM8 14.8c-3.7 0-6.8-3-6.8-6.8s3-6.8 6.8-6.8 6.8 3 6.8 6.8-3.1 6.8-6.8 6.8zm.6-7.4h2.8v1.2H8.6v2.8H7.4V8.6H4.6V7.4h2.8V4.6h1.2v2.8z"></path></svg><span class="add-room-btn__label">Add Room</span>`;

            // Remove Room button (initially hidden)
            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "remove-room-btn";
            removeBtn.innerHTML = `<svg class="wsf-section-icon" focusable="false" viewBox="0 0 16 16" style="display: block; height: auto; max-width: 100%;height: 18px;"><path d="M8 16c-2.1 0-4.1-.8-5.7-2.3S0 10.1 0 8s.8-4.1 2.3-5.7S5.9 0 8 0s4.1.8 5.7 2.3S16 5.9 16 8s-.8 4.1-2.3 5.7S10.1 16 8 16zM8 1.2c-3.7 0-6.8 3-6.8 6.8s3 6.8 6.8 6.8 6.8-3 6.8-6.8S11.7 1.2 8 1.2zm3.4 6.2H4.6v1.2h6.9V7.4z"></path></svg><span class="remove-room-btn__label">Remove Room</span>`;

            buttonContainer.appendChild(addBtn);
            buttonContainer.appendChild(removeBtn);

            // Insert button container at the beginning of the additional fields
            container.insertBefore(buttonContainer, container.firstChild);

            // console.log("Additional room buttons added");
        } catch (e) {
            // Container not found, skip adding buttons
        }
    }

    // ================= ROOM DETAILS GROUPING ===================
    // Visually group "Room Details" (primary room) + additional rooms into one
    // shared card, with "Room 1", "Room 2"... labels, so they read as one section.
    function addPrimaryRoomLabel() {
        const primaryColumn = document.querySelector(".passangerfields .wp-block-column");
        if (!primaryColumn) return;
        if (primaryColumn.querySelector(".room-number-label")) return; // already added

        const roomMain = primaryColumn.querySelector(".room_main:not(.additional-room)");
        if (!roomMain) return;

        const label = document.createElement("h4");
        label.className = "room-number-label room-number-label--first";
        label.textContent = "Room 1";
        primaryColumn.insertBefore(label, roomMain);
    }

    function groupRoomDetailsSection() {
        // Already grouped - just make sure the "Room 1" label is present (DOM may have refreshed)
        if (document.querySelector(".room-details-card")) {
            addPrimaryRoomLabel();
            return;
        }

        const passangerFields = document.querySelector(".passangerfields.atg-passanger-details") || document.querySelector(".passangerfields");
        if (!passangerFields) return;

        const additionalFields = document.querySelector(".additionalfields");

        // Room 1's own "Passenger Details" block sits as the next sibling after .passangerfields
        let leadPassengerContainer = null;
        const sib = passangerFields.nextElementSibling;
        if (sib && sib.classList.contains("passenger-details-container")) {
            leadPassengerContainer = sib;
        }

        const card = document.createElement("div");
        card.className = "room-details-card";

        passangerFields.parentNode.insertBefore(card, passangerFields);
        card.appendChild(passangerFields);
        if (leadPassengerContainer) card.appendChild(leadPassengerContainer);
        if (additionalFields) card.appendChild(additionalFields);

        addPrimaryRoomLabel();
        // console.log("Room details section grouped into one card");
    }

    // Use event delegation for button clicks to avoid issues with dynamic elements
    document.addEventListener("click", function(e) {
        // Handle add room button click
        if (e.target.closest(".add-room-btn")) {
            // console.log("Add room button clicked");
            duplicateRoom();
            // Show remove button when there are additional rooms
            const removeBtn = document.querySelector(".remove-room-btn");
            if (removeBtn && window.tripData.additionalRoomsCount > 0) {
                removeBtn.style.display = "flex";
            }
        }

        // Handle remove room button click
        if (e.target.closest(".remove-room-btn")) {
            // console.log("Remove room button clicked");
            removeLatestRoom();
            // Hide remove button if no additional rooms left
            const removeBtn = document.querySelector(".remove-room-btn");
            if (removeBtn && window.tripData.additionalRoomsCount === 0) {
                removeBtn.style.display = "none";
            }
        }
    });

    function duplicateRoom() {
        // console.log("Duplicating room");
        const roomMain = document.querySelector(".room_main");
        const container = document.querySelector(".additionalfields .wp-block-column");
        if (!roomMain || !container) {
            // Room main or container not found
            return;
        }

        window.tripData.additionalRoomsCount++;
        const roomIndex = window.tripData.additionalRoomsCount;
        // console.log("Creating additional room", roomIndex);

        const newRoom = roomMain.cloneNode(true);
        newRoom.classList.add("additional-room");
        newRoom.dataset.roomIndex = roomIndex;

        const wrapperAdditionalRoom = document.createElement('div');
        wrapperAdditionalRoom.classList.add('additional-room-details-container');
        while (newRoom.firstChild) {
            wrapperAdditionalRoom.appendChild(newRoom.firstChild);
        }
        newRoom.appendChild(wrapperAdditionalRoom);
        
        // Update all field names to be unique
        const roomSelect = newRoom.querySelector('select[name="select_room"]');
        const passengerInput = newRoom.querySelector('input[name="number_of_passenger"]');
        const subtotalInput = newRoom.querySelector('input[name="sub_total"]');
        
        if (roomSelect) {
            roomSelect.name = `select_room_${roomIndex}`;
            roomSelect.value = "";
        }

        if (passengerInput) {
            passengerInput.name = `number_of_passenger_${roomIndex}`;
            passengerInput.value = "";
        }

        if (subtotalInput) {
            subtotalInput.name = `sub_total_${roomIndex}`;
            subtotalInput.value = "";
        }

        
        // Clear all values
        const selects = newRoom.querySelectorAll("select, input");
        selects.forEach(el => { 
            if (el !== roomSelect && el !== passengerInput && el !== subtotalInput) {
                el.value = ""; 
            }
        });
        
        // Add room title (e.g. "Room 2", "Room 3"...) so it reads as a continuation of "Room Details"
        const roomTitle = document.createElement("h4");
        roomTitle.className = "room-number-label";
        roomTitle.textContent = `Room ${roomIndex + 1}`;

        newRoom.insertBefore(roomTitle, newRoom.firstChild);
        
        container.insertBefore(newRoom, container.querySelector('.additional-room-buttons'));
        initializeRoomEvents(newRoom, roomIndex);
        
        // Set default room selection and passenger count
        setDefaultRoomSelection(newRoom, roomIndex);
        
        updateAdditionalRoomsData();
        updateTotalCalculation();
        
        // console.log("Additional room created:", roomIndex);
    }

    function setDefaultRoomSelection(roomDiv, roomIndex) {
        // console.log("Setting default room selection for room", roomIndex);
        const roomSelect = roomDiv.querySelector(`select[name="select_room_${roomIndex}"]`);
        const passengerInput = roomDiv.querySelector(`input[name="number_of_passenger_${roomIndex}"]`);
        
        if (!roomSelect || !passengerInput) {
            // Room select or passenger input not found for room
            return;
        }
		
		roomSelect.selectedIndex = 0;
        passengerInput.value = "";
        
        // console.log("Set default 'Select Room' for additional room", roomIndex);
        
//         // Select the first available room option
//         if (roomSelect.options.length > 1) {
//             roomSelect.selectedIndex = 1; // Skip the "Select Room" option
//             const selectedOption = roomSelect.options[roomSelect.selectedIndex];
            
//             // Extract room type and set default passenger count
//             if (selectedOption && selectedOption.dataset.roomType) {
//                 const roomType = selectedOption.dataset.roomType;
//                 const limits = getPassengerLimits(roomType);
//                 passengerInput.value = limits.default;
                
//                 // Generate passenger fields immediately
//                 generateAdditionalPassengerFields(roomDiv, roomIndex);
//             }
            
//             // Trigger change event to update calculations
//             roomSelect.dispatchEvent(new Event('change'));
//             console.log("Set default selection for room", roomIndex);
//         } else {
//             console.log("No room options available for room", roomIndex);
//         }
    }

    function removeLatestRoom() {
        // console.log("Removing latest room");
        if (window.tripData.additionalRoomsCount === 0) {
            // console.log("No additional rooms to remove");
            return;
        }
        
        const latestRoom = document.querySelector(`.additional-room[data-room-index="${window.tripData.additionalRoomsCount}"]`);
        if (latestRoom) {
            latestRoom.remove();
            window.tripData.additionalRoomsCount--;
            updateAdditionalRoomsData();
            updateTotalCalculation();
            // console.log("Removed room", window.tripData.additionalRoomsCount + 1);
        } else {
            // console.log("Latest room not found");
        }
    }

    function initializeRoomEvents(roomDiv, roomIndex) {
        // console.log("Initializing room events for room", roomIndex);
        const roomSelect = roomDiv.querySelector(`select[name="select_room_${roomIndex}"]`);
        const passengerInput = roomDiv.querySelector(`input[name="number_of_passenger_${roomIndex}"]`);
        const subtotalInput = roomDiv.querySelector(`input[name="sub_total_${roomIndex}"]`);

        if (roomSelect && !roomSelect._subtotalAttached) {
            roomSelect.addEventListener("change", function() {
                // console.log("Room selection changed for room", roomIndex);
                // Get limits for the selected room
                const selectedOption = roomSelect.options[roomSelect.selectedIndex];
                if (selectedOption) {
                    const roomType = selectedOption.value.split('_').slice(2).join('_');
                    const limits = getPassengerLimits(roomType);
                    
                    updatePassengerInputLimits(roomSelect, passengerInput);
                    calculateRoomSubtotal(roomIndex);
                    generateAdditionalPassengerFields(roomDiv, roomIndex);
                    updateAdditionalRoomsData();
                    updateTotalCalculation();
                }
            });
            roomSelect._subtotalAttached = true;
        }
        
        if (passengerInput && !passengerInput._generateAttached) {
            passengerInput.addEventListener("input", function() {
                // console.log("Passenger input changed for room", roomIndex);
                generateAdditionalPassengerFields(roomDiv, roomIndex);
                calculateRoomSubtotal(roomIndex);
                updateAdditionalRoomsData();
                updateTotalCalculation();
            });
            passengerInput._generateAttached = true;
        }
    }
    
    function calculateRoomSubtotal(roomIndex) {
        // console.log("Calculating subtotal for room", roomIndex);
        const roomSelect = document.querySelector(`select[name="select_room_${roomIndex}"]`);
        const passengerInput = document.querySelector(`input[name="number_of_passenger_${roomIndex}"]`);
        const subtotalInput = document.querySelector(`input[name="sub_total_${roomIndex}"]`);

        if (!roomSelect || !passengerInput || !subtotalInput) {
            // Elements not found for room
            return;
        }

        const selectedOption = roomSelect.options[roomSelect.selectedIndex];
        const passengers = parseInt(passengerInput.value) || 0;

        // console.log("Selected option for room", roomIndex, ":", selectedOption);
        // console.log("Passengers for room", roomIndex, ":", passengers);

        if (selectedOption && selectedOption.dataset.price && passengers > 0) {
            const roomPrice = parseFloat(selectedOption.dataset.price);
            const subtotal = roomPrice * passengers;
            subtotalInput.value = window.atgFormatCurrency(subtotal);
            // console.log("Calculated subtotal for room", roomIndex, ": £" + subtotal.toFixed(2));

            // Trigger input event for deposit calculation
            const inputEvent = new Event('input', { bubbles: true });
            subtotalInput.dispatchEvent(inputEvent);
        } else {
            subtotalInput.value = "";
            // console.log("Cleared subtotal for room", roomIndex);

            // Trigger input event even when cleared
            const inputEvent = new Event('input', { bubbles: true });
            subtotalInput.dispatchEvent(inputEvent);
        }
    }

    function generateAdditionalPassengerFields(roomDiv, roomIndex) {
        // console.log("Generating additional passenger fields for room", roomIndex);
        const passengerInput = roomDiv.querySelector(`input[name="number_of_passenger_${roomIndex}"]`);
        const passengers = parseInt(passengerInput.value) || 0;
        
        // Find or create passenger container
        let passengerContainer = roomDiv.querySelector(".passenger-details-container");
        if (!passengerContainer) {
            passengerContainer = document.createElement("div");
            passengerContainer.className = "passenger-details-container";
            roomDiv.appendChild(passengerContainer);
        }
        
        if (passengers === 0) {
            passengerContainer.innerHTML = "";
            // console.log("No passengers for room", roomIndex);
            return;
        }
        
        passengerContainer.innerHTML = "";
        passengerContainer.innerHTML = `<h4>Passenger Details</h4>`;
        
        // console.log("Generating fields for", passengers, "passengers in room", roomIndex);
        
        for (let i = 1; i <= passengers; i++) {
            const passengerSection = document.createElement("div");
            passengerSection.className = "passenger-section";

            passengerSection.innerHTML = `
                <div class="jet-form-col">
                    <label>Title *</label>
                    <input type="text" name="passenger_title_${roomIndex}_${i}" required>
                </div>
                <div class="jet-form-col">
                    <label>First Name *</label>
                    <input type="text" name="passenger_first_name_${roomIndex}_${i}" required>
                </div>
                <div class="jet-form-col">
                    <label>Last Name *</label>
                    <input type="text" name="passenger_last_name_${roomIndex}_${i}" required>
                </div>
            `;
            
            passengerContainer.appendChild(passengerSection);
        }
        
        // console.log("Passenger fields generated for room", roomIndex);
        
        if (window.updatePassengerDataText) window.updatePassengerDataText();
    }

    function updateAdditionalRoomsData() {
        // console.log("Updating additional rooms data");
        const container = document.querySelector(".additionalfields .wp-block-column");
        const hiddenField = document.querySelector('input[name="additional_rooms"]');
        if (!container || !hiddenField) {
            // Container or hidden field not found
            return;
        }

        const roomsData = [];
        const rooms = container.querySelectorAll(".additional-room");
        // console.log("Found", rooms.length, "additional rooms");

        rooms.forEach((room) => {
            const roomIndex = room.dataset.roomIndex;
            const roomSelect = room.querySelector(`select[name="select_room_${roomIndex}"]`);
            const passengerInput = room.querySelector(`input[name="number_of_passenger_${roomIndex}"]`);
            
            if (roomSelect && passengerInput) {
                const selectedOption = roomSelect.options[roomSelect.selectedIndex];
                const roomPrice = selectedOption ? parseFloat(selectedOption.dataset.price || 0) : 0;
                const passengers = parseInt(passengerInput.value) || 0;
                
                // Get passenger details for this room
                const passengerDetails = [];
                for (let i = 1; i <= passengers; i++) {
                    const title = document.querySelector(`[name="passenger_title_${roomIndex}_${i}"]`)?.value || "";
                    const firstName = document.querySelector(`[name="passenger_first_name_${roomIndex}_${i}"]`)?.value || "";
                    const lastName = document.querySelector(`[name="passenger_last_name_${roomIndex}_${i}"]`)?.value || "";
                    
                    if (title || firstName || lastName) {
                        passengerDetails.push(`Passenger ${i}: ${title} ${firstName} ${lastName}`);
                    }
                }
                
                // Format room type for better readability
                let roomType = "Unknown";
                if (selectedOption) {
                    const roomValue = selectedOption.value;
                    // Upgrade variants must be checked first - "twin_room_upgrade" and
                    // "single_occupancy_upgrade" both contain the base room's string too,
                    // so checking the base first would always match it and never reach
                    // the upgrade case.
                    if (roomValue.includes("double_upgrade")) roomType = "Double Room (Upgrade)";
                    else if (roomValue.includes("twin_room_upgrade")) roomType = "Twin Room (Upgrade)";
                    else if (roomValue.includes("single_occupancy_upgrade")) roomType = "Single Occupancy (Double Room) (Upgrade)";
                    else if (roomValue.includes("double_room")) roomType = "Double Room";
                    else if (roomValue.includes("twin_room")) roomType = "Twin Room";
                    else if (roomValue.includes("single_occupancy")) roomType = "Single Occupancy (Double Room)";
                }
                
                roomsData.push({
                    room_type: roomType,
                    room_price: window.atgFormatCurrency(roomPrice),
                    passengers: passengers,
                    total: window.atgFormatCurrency(roomPrice * passengers),
                    passenger_details: passengerDetails.join(", ")
                });
            }
        });

        // Format as user-friendly text instead of JSON
        let formattedText = "";
        roomsData.forEach((room, index) => {
            formattedText += `Additional Room ${index + 1}: ${room.room_type} - ${room.room_price} x ${room.passengers} passengers = ${room.total}`;
            if (room.passenger_details) {
                formattedText += ` (${room.passenger_details})`;
            }
            formattedText += "\n";
        });
        
        hiddenField.value = formattedText.trim();
        // console.log("Updated additional rooms data:", formattedText);

        // Trigger change event for form validation
        const changeEvent = new Event('change', { bubbles: true });
        hiddenField.dispatchEvent(changeEvent);
    }
    
    function updateTotalCalculation() {
        // console.log("Updating total calculation");
        let total = 0;
        
        // Calculate main room total
        const mainRoomSelect = document.querySelector('select[name="select_room"]');
        const mainPassengerInput = document.querySelector('input[name="number_of_passenger"]');
        const mainSubtotalInput = document.querySelector('input[name="sub_total"]');
        
        if (mainRoomSelect && mainPassengerInput && mainSubtotalInput) {
            const selectedOption = mainRoomSelect.options[mainRoomSelect.selectedIndex];
            const passengers = parseInt(mainPassengerInput.value) || 0;
            
            if (selectedOption && selectedOption.dataset.price && passengers > 0) {
                const roomPrice = parseFloat(selectedOption.dataset.price);
                total += roomPrice * passengers;
                // console.log("Main room total: £" + (roomPrice * passengers).toFixed(2));
            }
        }
        
        // Calculate additional rooms total
        for (let i = 1; i <= window.tripData.additionalRoomsCount; i++) {
            const roomSelect = document.querySelector(`select[name="select_room_${i}"]`);
            const passengerInput = document.querySelector(`input[name="number_of_passenger_${i}"]`);
            
            if (roomSelect && passengerInput) {
                const selectedOption = roomSelect.options[roomSelect.selectedIndex];
                const passengers = parseInt(passengerInput.value) || 0;
                
                if (selectedOption && selectedOption.dataset.price && passengers > 0) {
                    const roomPrice = parseFloat(selectedOption.dataset.price);
                    total += roomPrice * passengers;
                    // console.log("Additional room", i, "total: £" + (roomPrice * passengers).toFixed(2));
                }
            }
        }
        
        // Update grand total if exists
        const grandTotalInput = document.querySelector('input[name="grand_total"]');
        if (grandTotalInput) {
            grandTotalInput.value = total > 0 ? window.atgFormatCurrency(total) : "";
            // console.log("Grand total: £" + total.toFixed(2));

            // Trigger change event for form validation
            const changeEvent = new Event('change', { bubbles: true });
            grandTotalInput.dispatchEvent(changeEvent);
        }
    }

    // Auto-populate room options if we have valid trip data
    if (window.tripData.tripOptions && window.tripData.tripOptions.length > 0) {
        // console.log("Auto-populating room options with default trip");
        
        // Use the first available trip (index 0)
        const defaultTripIndex = 0;
        window.tripData.selectedTripIndex = defaultTripIndex;
        
        // Wait for the form to be available
        const checkFormInterval = setInterval(() => {
            const roomSelect = document.querySelector('select[name="select_room"]');
            if (roomSelect) {
                clearInterval(checkFormInterval);
                // console.log("Form found, populating room options");
                populateRoomOptions(defaultTripIndex);
            }
        }, 100);
        
        // Also set up a timeout to stop checking
        setTimeout(() => {
            clearInterval(checkFormInterval);
        }, 5000);
    }

    // Initialize everything
    // console.log("Initializing additional room button");
    addAdditionalRoomButton();
    groupRoomDetailsSection();
    const roomObserver = new MutationObserver(() => {
        // console.log("DOM mutation detected, checking for additional room button");
        addAdditionalRoomButton();
        groupRoomDetailsSection();
    });
    roomObserver.observe(document.body, { childList: true, subtree: true });

    // ================= DEPOSIT CALCULATOR ===================
    // Simple deposit calculation on next button click
    document.addEventListener('click', function(e) {
        if (e.target.matches('button.jet-form-builder__next-page') || e.target.closest('button.jet-form-builder__next-page')) {
            // console.log("Next button clicked - calculating deposit");

            // Find all subtotal fields
            const subtotalFields = document.querySelectorAll('[data-field-name="sub_total"]');
            let total = 0;

            // Sum up all subtotals
            subtotalFields.forEach(function(field) {
                const value = field.value.replace(/[^0-9.]/g, '');
                const numericValue = parseFloat(value) || 0;
                total += numericValue;
                // console.log("Subtotal field value:", field.value, "Numeric:", numericValue);
            });

            // console.log("Total sum:", total);

            // Check if departure date contains "2026"
            let show2026PromoCode = false;
            const departureInput = document.querySelector('input#_departure');
            const departureSelect = document.querySelector('select#_departure_select');

            if (departureInput && departureInput.value.includes('2026')) {
                show2026PromoCode = true;
            } else if (departureSelect && departureSelect.value.includes('2026')) {
                show2026PromoCode = true;
            }

            // Show/hide promo code field based on 2026 check
            const promoCodeInput = document.querySelector('input[name="promo_code"]');
            if (promoCodeInput) {
                const promoWrapper = promoCodeInput.closest('div.jet-sm-gb-wrapper');
                if (promoWrapper) {
                    promoWrapper.style.display = show2026PromoCode ? 'block' : 'none';
                }
            }

            // Check if promo code is active (reuse promoCodeInput from above)
            const promoCode = promoCodeInput ? promoCodeInput.value : '';
            const isPromoActive = isPromoCodeActive(promoCode, total);
            const promoSettings = getPromoSettings();

            let finalTotal = total;
            let discountAmount = 0;

            if (isPromoActive) {
                finalTotal = total * (1 - promoSettings.discountFraction);
                discountAmount = total * promoSettings.discountFraction;
            }

            // Display total tour price
            const depositWrapper = document.querySelector('div[data-update-field-name="deposit"]');
            if (depositWrapper) {
                // Remove existing total price if any
                const existingTotal = depositWrapper.querySelector('p.total_tour_price');
                if (existingTotal) {
                    existingTotal.remove();
                }

                // Create total price display
                const totalPriceElement = document.createElement('p');
                totalPriceElement.className = 'total_tour_price';

                if (isPromoActive) {
                    // Show discounted price
                    const discountPercentLabel = Math.round(promoSettings.discountFraction * 1000) / 10;
                    totalPriceElement.innerHTML =
                        'Total Holiday Price: <span style="text-decoration: line-through;">' + window.atgFormatCurrency(total) + '</span> ' +
                        '<span style="color: green; font-weight: bold;">' + window.atgFormatCurrency(finalTotal) + '</span> ' +
                        '<small style="color: green;">(' + discountPercentLabel + '% discount: -' + window.atgFormatCurrency(discountAmount) + ')</small>';
                } else {
                    // Show regular price
                    totalPriceElement.innerHTML = 'Total Holiday Price: ' + window.atgFormatCurrency(total);
                }

                depositWrapper.insertBefore(totalPriceElement, depositWrapper.firstChild);
            }

            // Deposit is a fixed amount per passenger (independent vs escorted rate).
            // Whether the promo code also discounts the deposit is controlled by the
            // "Apply discount to the deposit too?" setting in wp-admin.
            let deposit = calculateFixedDeposit(isPromoActive);

            // Find and update deposit field
            const depositField = document.querySelector('input#deposit');
            const depositFieldLabel = document.querySelector('.custom-deposit-field .jet-form-builder__label-text');
            if (depositField) {
                depositField.value = deposit;
                depositField.readOnly = true;
                if(depositFieldLabel){
                    depositFieldLabel.innerHTML = buildDepositLabelHtml(deposit);
                }
                // console.log("Deposit set to:", deposit, "Field set to readonly");
            } else {
                // console.log("Deposit field not found");
            }

            // Generate summary after delay
            setTimeout(function() {
                generateCompleteSummary();
            }, 500);
        }
    });

    // ================= PROMO CODE HANDLER ===================
    // Handle promo code changes. The discount always affects the Total Holiday Price
    // display (the balance due later); whether it also affects today's deposit depends
    // on the "Apply discount to the deposit too?" setting in wp-admin.
    document.addEventListener('change', function(e) {
        if (e.target.matches('input[name="promo_code"]')) {
            const totalPriceElement = document.querySelector('p.total_tour_price');

            if (!totalPriceElement) return;

            // Get the original total from subtotal fields
            const subtotalFields = document.querySelectorAll('[data-field-name="sub_total"]');
            let total = 0;
            subtotalFields.forEach(function(field) {
                const value = field.value.replace(/[^0-9.]/g, '');
                const numericValue = parseFloat(value) || 0;
                total += numericValue;
            });

            const isPromoActive = isPromoCodeActive(e.target.value, total);
            const promoSettings = getPromoSettings();

            if (isPromoActive) {
                const discountedTotal = total * (1 - promoSettings.discountFraction);
                const discountAmount = total * promoSettings.discountFraction;
                const discountPercentLabel = Math.round(promoSettings.discountFraction * 1000) / 10;

                // Update total price display with strikethrough
                totalPriceElement.innerHTML =
                    'Total Holiday Price: <span style="text-decoration: line-through;">' + window.atgFormatCurrency(total) + '</span> ' +
                    '<span style="color: green; font-weight: bold;">' + window.atgFormatCurrency(discountedTotal) + '</span> ' +
                    '<small style="color: green;">(' + discountPercentLabel + '% discount: -' + window.atgFormatCurrency(discountAmount) + ')</small>';
            } else {
                // Reset to original price
                totalPriceElement.innerHTML = 'Total Holiday Price: ' + window.atgFormatCurrency(total);
            }

            // Only touch the deposit here if the admin setting says the promo should
            // affect it - otherwise leave it exactly as calculateFixedDeposit() set it.
            if (promoSettings.appliesToDeposit) {
                const depositField = document.querySelector('input#deposit');
                const depositFieldLabel = document.querySelector('.custom-deposit-field .jet-form-builder__label-text');
                if (depositField) {
                    const depositValue = calculateFixedDeposit(isPromoActive);
                    depositField.value = depositValue;
                    if (depositFieldLabel) {
                        depositFieldLabel.innerHTML = buildDepositLabelHtml(depositValue);
                    }
                }
            }
        }
    });

    // ================= PREVENT DOUBLE SUBMISSION ===================
    // Guard against double-clicking "Pay Deposit". Listening on the form's native
    // "submit" event (rather than the button's click) means this only fires once
    // JetFormBuilder's own validation has already passed, so a validation failure
    // never leaves the button stuck showing "Processing...". Without this, a fast
    // double-click can create two separate booking records for the same submission,
    // and each one legitimately triggers its own confirmation email.
    document.addEventListener('submit', function(e) {
        const form = e.target;
        if (!form || !form.classList || !form.classList.contains('jet-form-builder')) return;

        const submitBtn = form.querySelector('.jet-form-builder__submit');
        if (!submitBtn) return;

        if (submitBtn.dataset.atgSubmitting === 'true') {
            e.preventDefault();
            e.stopImmediatePropagation();
            return false;
        }

        submitBtn.dataset.atgSubmitting = 'true';
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.6';
        submitBtn.style.cursor = 'not-allowed';
        submitBtn.dataset.atgOriginalText = submitBtn.textContent;
        submitBtn.textContent = 'Processing...';

        // Safety net in case the gateway redirect never happens (e.g. the customer
        // closes a payment popup) so the button doesn't stay disabled forever.
        setTimeout(function() {
            if (document.body.contains(submitBtn)) {
                submitBtn.disabled = false;
                submitBtn.dataset.atgSubmitting = 'false';
                submitBtn.style.opacity = '';
                submitBtn.style.cursor = '';
                submitBtn.textContent = submitBtn.dataset.atgOriginalText || 'Pay Deposit';
            }
        }, 15000);
    }, true);

    // ================= REVIEW PAGE TITLE ===================
    // The review/summary page is built entirely in Elementor/JetFormBuilder (no PHP
    // template in this plugin renders it), so its title is inserted client-side here
    // rather than hardcoded into any page-builder content.
    function ensureReviewPageTitle() {
        const reviewPage = document.querySelector('.custom-block-review-page');
        if (!reviewPage || reviewPage.querySelector('.atg-review-page-title')) {
            return;
        }
        const title = document.createElement('h2');
        title.className = 'atg-review-page-title';
        title.textContent = 'Please review your booking before paying your deposit';
        reviewPage.insertBefore(title, reviewPage.firstChild);
    }

    // ================= SUMMARY GENERATOR ===================
    function generateCompleteSummary() {
        // console.log("Generating complete summary");

        ensureReviewPageTitle();

        const summaryContainer = document.querySelector('p.complete_summary');
        if (!summaryContainer) {
            // console.log("Summary container not found");
            return;
        }

        // Collect all form data
        const form = document.querySelector('form.jet-form-builder');
        if (!form) {
            // console.log("Form not found");
            return;
        }

        const formData = new FormData(form);
        const values = {};
        for (let [name, value] of formData.entries()) {
            if (values[name]) {
                if (Array.isArray(values[name])) {
                    values[name].push(value);
                } else {
                    values[name] = [values[name], value];
                }
            } else {
                values[name] = value;
            }
        }

        // console.log("Form values collected:", values);

        // Build room details HTML
        let roomsHtml = '';
        let i = 0;
        while (true) {
            let suffix = (i > 0) ? "_" + i : "";
            if (values.hasOwnProperty("select_room" + suffix)) {
                // Get passenger names directly from the DOM rather than FormData. The
                // passenger-detail inputs are created dynamically (generatePassengerFields()/
                // generateAdditionalPassengerFields()) and can end up outside the actual
                // <form> boundary in some Elementor popup layouts - setupFormSyncIfPresent()
                // already has a document-wide fallback query for this same reason, which is
                // why updatePassengerDataText() (the hidden passenger_data field) shows names
                // correctly while a FormData-only lookup here was silently coming up empty.
                let passengersHtml = '';
                let sectionsContainer = null;
                if (i === 0) {
                    sectionsContainer = document.querySelector('.passangerfields .passenger-details-container')
                        || document.querySelector('.passenger-details-container');
                } else {
                    const roomDiv = document.querySelector('.additional-room[data-room-index="' + i + '"]');
                    sectionsContainer = roomDiv ? roomDiv.querySelector('.passenger-details-container') : null;
                }
                const sections = sectionsContainer ? sectionsContainer.querySelectorAll('.passenger-section') : [];
                sections.forEach(function(section) {
                    const titleInput = section.querySelector('input[name^="passenger_title"]');
                    const firstNameInput = section.querySelector('input[name^="passenger_first_name"]');
                    const lastNameInput = section.querySelector('input[name^="passenger_last_name"]');
                    const title = titleInput ? titleInput.value : '';
                    const firstName = firstNameInput ? firstNameInput.value : '';
                    const lastName = lastNameInput ? lastNameInput.value : '';
                    passengersHtml += `, ${title} ${firstName} ${lastName}`;
                });

                // Determine room type. Upgrade variants must be checked first - see
                // the matching comment in updateAdditionalRoomsData() for why.
                let roomType = 'Unknown';
                let roomValue = values["select_room" + suffix];
                if (roomValue.includes("double_upgrade")) roomType = "Double Room (Upgrade)";
                else if (roomValue.includes("twin_room_upgrade")) roomType = "Twin Room (Upgrade)";
                else if (roomValue.includes("single_occupancy_upgrade")) roomType = "Single Occupancy (Double Room) (Upgrade)";
                else if (roomValue.includes("double_room")) roomType = "Double Room";
                else if (roomValue.includes("twin_room")) roomType = "Twin Room";
                else if (roomValue.includes("single_occupancy")) roomType = "Single Occupancy (Double Room)";

                roomsHtml += `
                    <div class="summary-room-details-container">
                        <div class="summary-rd-room-type"><strong>Room Type:</strong> ${roomType}</div>
                        <div class="summary-rd-passengers"><strong>Passengers:</strong> ${values["number_of_passenger" + suffix]}</div>
                        <div class="summary-rd-subtotal"><strong>Subtotal:</strong> ${values["sub_total" + suffix]}</div>
                        <div class="summary-rd-passenger-names"><strong>Passenger Names:</strong> ${passengersHtml.slice(2) || 'N/A'}</div>
                    </div>
                `;
                i++;
            } else {
                break;
            }
        }

        // Build complete summary HTML. this could be for escorted form. figured out by mike on 12/26/2025 when client reported error where escorted form summary showed trip name instead of trip length
        // <div style="margin-bottom: 8px;"><strong style="color: #333;">Deposit:</strong> ${values['deposit'] || 'N/A'}</div>

        // Lead passenger title + address + additional requests (previously missing from the summary)
        const leadTitle = values['title_field'] || '';
        const leadName = `${leadTitle} ${values['first_name'] || ''} ${values['last_name'] || ''}`.replace(/\s+/g, ' ').trim();
        const leadAddress = values['full_address'] ? String(values['full_address']).replace(/\n/g, '<br>') : '';
        const additionalRequests = values['additional_requests'] ? String(values['additional_requests']).replace(/\n/g, '<br>') : '';

        const additionalRequestsHtml = additionalRequests
            ? `
            <div class="summary-additional-requests">
                <div class="summary-container">
                    <div class="summary-title">Additional Requests</div>
                    <div>${additionalRequests}</div>
                </div>
            </div>
            `
            : '';

        const summaryHtml = `
            <div class="summary-wrapper">
                <div class="summary-holiday-details summary-inner-wrapper">
                    <div class="summary-container">
                        <div class="summary-title">Holiday Details</div>
                        <div class="summary-trip-selected"><strong>Trip Selected:</strong> ${atg_tour_data.page_name || 'N/A'}</div>
                        <div class="summary-trip-length"><strong>Trip Length:</strong> ${
                            typeof values['triptitle'] === "string" && values['triptitle'].toLowerCase().includes("escorted")
                                ? (
                                    (() => {
                                        const el = document.querySelector("div.trip_duration .jet-headline__second .jet-headline__label");
                                        return el && el.textContent ? el.textContent : (values['triptitle'] || 'N/A');
                                    })()
                                )
                                : (values['triptitle'] || 'N/A')
                        }</div>
                        <div class="summary-departure-date"><strong>Departure Date:</strong> ${values['_departure'] ? window.atgFormatDDMMYYYY(values['_departure']) : 'N/A'}</div>
                    </div>
                </div>

                <div class="summary-lead-passenger summary-inner-wrapper">
                    <div class="summary-container">
                        <div class="summary-title">Lead Passenger Details</div>
                        <div class="summary-lp-name"><strong>Name:</strong> ${leadName || 'N/A'}</div>
                        <div class="summary-lp-email"><strong>Email:</strong> ${values['email'] || 'N/A'}</div>
                        <div class="summary-lp-phone"><strong>Phone:</strong> ${values['phone'] || 'N/A'}</div>
                        <div class="summary-lp-address"><strong>Address:</strong> ${leadAddress || 'N/A'}</div>
                    </div>
                </div>
            </div>

            <div class="summary-room-details">
                <div class="summary-container">
                    <div class="summary-title">Room Details</div>
                    ${roomsHtml}
                </div>
            </div>
            ${additionalRequestsHtml}
        `;

        summaryContainer.innerHTML = summaryHtml;
        // console.log("Summary generated successfully");
    }

    // ================= EMAIL & PHONE VALIDATION ===================
    // Validate email and phone fields dynamically
    document.addEventListener('input', function(e) {
        const target = e.target;

        // Email validation
        if (target.id === 'email' || target.name === 'email') {
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (target.value && !emailPattern.test(target.value)) {
                target.setCustomValidity('Please enter a valid email address');
                target.style.borderColor = 'red';
            } else {
                target.setCustomValidity('');
                target.style.borderColor = '';
            }
        }

        // Phone validation (must start with + and contain only numbers)
        if (target.id === 'phone' || target.name === 'phone') {
            const phonePattern = /^[0-9]+$/;

            // Auto-add + if not present and user starts typing
            /*if (target.value && !target.value.startsWith('+')) {
                target.value = '+' + target.value.replace(/[^0-9]/g, '');
            }*/

            target.value = target.value.replace(/[^0-9]/g, '');

            // Validate format
            if (target.value && !phonePattern.test(target.value)) {
                target.setCustomValidity('Phone must start with + and contain only numbers');
                target.style.borderColor = 'red';
            } else {
                target.setCustomValidity('');
                target.style.borderColor = '';
            }
        }
    });

    // Prevent invalid characters in phone field
    document.addEventListener('keydown', function(e) {
        const target = e.target;
        if (target.id === 'phone' || target.name === 'phone') {
            // Allow: backspace, delete, tab, escape, enter, and numbers
            if ([46, 8, 9, 27, 13].indexOf(e.keyCode) !== -1 ||
                // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                (e.keyCode === 65 && e.ctrlKey === true) ||
                (e.keyCode === 67 && e.ctrlKey === true) ||
                (e.keyCode === 86 && e.ctrlKey === true) ||
                (e.keyCode === 88 && e.ctrlKey === true) ||
                // Allow: home, end, left, right
                (e.keyCode >= 35 && e.keyCode <= 39)) {
                return;
            }
            // Ensure that it is a number and stop the keypress
            if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                e.preventDefault();
            }
        }
    });

    // Close Action on Popup - Dont show "status" message again
    document.addEventListener('click', function(e) {
        if(e.target.closest('.dialog-close-button') && e.target.closest('.elementor-popup-modal')){
            if(window.location.href.includes('?')){
                e.preventDefault();
                window.location.href = window.location.href.split('?')[0];
            }
        }
    });
});
