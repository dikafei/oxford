<?php
/**
 * Frontend Data for Tour Pages
 * Adds hidden JSON data to tour post type pages
 * 
 * @package ATG Oxford Helper
 * @since 1.0.1
 */

// Exit if accessed directly
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * ATG Tour Frontend Data Class
 * Handles adding JSON data to tour pages via wp_localize_script
 */
class ATG_Tour_Frontend_Data {

    /**
     * Constructor - Initialize hooks
     */
    public function __construct() {
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_tour_scripts' ), 20 );
    }

    /**
     * Check if current page is a tour post type
     * 
     * @return bool True if tour page, false otherwise
     */
    private function is_tour_page() {
        return is_singular( 'tour' );
    }

    /**
     * Get tour page data (post ID, title, and custom fields)
     *
     * @return array Tour data or empty array
     */
    private function get_tour_data() {
        if ( ! $this->is_tour_page() ) {
            return array();
        }

        global $post;
        
        if ( ! $post ) {
            return array();
        }

        // Base tour data
        $tour_data = array(
            'post_id'   => $post->ID,
            'page_name' => get_the_title( $post->ID )
        );

        // Get is_escorted from tour_type custom field
        $is_escorted = $this->get_is_escorted( $post->ID );
        $tour_data['is_escorted'] = $is_escorted;

        // Add pricing fields only if tour is escorted
        if ( $is_escorted ) {
            $tour_data['pricing_double'] = $this->get_pricing_field( $post->ID, '_pricing' );
            $tour_data['pricing_single_occupancy'] = $this->get_pricing_field( $post->ID, '_pricing_single_occupancy' );
            $tour_data['pricing_twin'] = $this->get_pricing_field( $post->ID, '_pricing_twin' );
        }

        // Deposit amounts + promo code behaviour - editable under Settings > ATG Booking
        // Settings instead of being hardcoded, applies to every tour regardless of type.
        if ( function_exists( 'atg_get_booking_settings' ) ) {
            $tour_data = array_merge( $tour_data, atg_get_booking_settings() );
        }

        return $tour_data;
    }

    /**
     * Parse tour_type custom field to determine if tour is escorted
     *
     * @param int $post_id Post ID
     * @return bool True if escorted, false otherwise
     */
    private function get_is_escorted( $post_id ) {
        $tour_type = get_post_meta( $post_id, 'tour_type', true );
        
        if ( empty( $tour_type ) ) {
            return false;
        }

        // Unserialize the data
        $tour_type_data = maybe_unserialize( $tour_type );
        
        if ( ! is_array( $tour_type_data ) ) {
            return false;
        }

        // Check if Escorted is set to true
        return isset( $tour_type_data['Escorted'] ) && $tour_type_data['Escorted'] === 'true';
    }

    /**
     * Get pricing field value as integer
     *
     * @param int $post_id Post ID
     * @param string $field_name Custom field name
     * @return int Pricing value or 0
     */
    private function get_pricing_field( $post_id, $field_name ) {
        $pricing = preg_replace('/\D/', '', get_post_meta( $post_id, $field_name, true ));
        return intval( $pricing );
    }

    /**
     * Enqueue tour scripts and data
     * Only runs on tour post type pages
     */
    public function enqueue_tour_scripts() {
        // Only proceed if this is a tour page
        if ( ! $this->is_tour_page() ) {
            return;
        }

        // Get tour data
        $tour_data = $this->get_tour_data();
        
        // Only proceed if we have data
        if ( empty( $tour_data ) ) {
            return;
        }

        // Enqueue tour data reader JavaScript (cache-busting via filemtime, same
        // as jetform-enhancement.js/css in the main plugin file - using the static
        // ATG_OXFORD_HELPER_VERSION here meant browsers/CDNs kept serving a stale
        // cached copy after every edit until that constant was manually bumped).
        $tour_data_reader_path = plugin_dir_path( dirname( __FILE__ ) ) . 'assets/js/tour-data-reader.js';
        wp_enqueue_script(
            'tour-data-reader',
            plugin_dir_url( dirname( __FILE__ ) ) . 'assets/js/tour-data-reader.js',
            array( 'jquery' ),
            file_exists( $tour_data_reader_path ) ? filemtime( $tour_data_reader_path ) : ATG_OXFORD_HELPER_VERSION,
            true
        );

        // Add the data to existing jetform-enhancement script
        wp_localize_script(
            'jetform-enhancement',
            'atg_tour_data',
            $tour_data
        );
    }
}

// Initialize the class
new ATG_Tour_Frontend_Data();

add_action('wp_footer', function() {
    if (is_singular('tour')) {
        $post_id = get_the_ID();
        $days_data = get_post_meta($post_id, '_days', true);
        
        echo '<div class="hotel_list_json" style="display:none">';
        if (!empty($days_data)) {
            // echo '<pre>';
            $unsldays_data = maybe_unserialize($days_data);
            $hotel_ids = array();

            if (is_array($unsldays_data)) {
                foreach ($unsldays_data as $day) {
                    if (isset($day['hotel']) && is_array($day['hotel'])) {
                        $hotel_ids = array_merge($hotel_ids, $day['hotel']);
                    }
                }
            }
            $hotel_details = array();
            $hotel_details[] = "Select hotel";
            foreach ($hotel_ids as $hotel_id) {
                $hotel_name = get_post_meta($hotel_id, 'hotel_name', true);
                $hotel_address = get_post_meta($hotel_id, 'hotel_address', true);
                if ($hotel_name && $hotel_address) {
                	$hotel_details[] = trim($hotel_name) . ' | ' . trim($hotel_address);
                }
            }
            echo json_encode($hotel_details);
        }
        echo '</div>';
    }
});

// moving code from child theme to here

/**
 * Find the most recent JetFormBuilder submission for a given email + form,
 * regardless of whether it has already triggered a notification email.
 *
 * The URL query string on the "reload" redirect only carries a handful of
 * whitelisted fields, so it's missing things like the lead's title, full
 * address, additional requests, and the per-room passenger breakdown for
 * additional rooms. The DB record has every submitted field by name, so we
 * use it as the source of truth for the thank-you page (and the email).
 *
 * @param int    $form_id JetFormBuilder form ID.
 * @param string $email   Email address to match against the submission.
 * @return array Associative array of field_name => field_value, or empty array if not found.
 */
function atg_get_latest_jetformbuilder_submission_by_email($form_id, $email) {
    global $wpdb;

    if (empty($email)) {
        return array();
    }

    $records_table = $wpdb->prefix . 'jet_fb_records';
    $fields_table = $wpdb->prefix . 'jet_fb_records_fields';

    $records_query = $wpdb->prepare(
        "SELECT * FROM $records_table WHERE form_id = %d ORDER BY id DESC",
        $form_id
    );
    $records = $wpdb->get_results($records_query, ARRAY_A);

    if (empty($records)) {
        return array();
    }

    foreach ($records as $record) {
        $submission_data = array();

        $fields_query = $wpdb->prepare(
            "SELECT field_name, field_value FROM $fields_table WHERE record_id = %d",
            $record['id']
        );
        $fields = $wpdb->get_results($fields_query, ARRAY_A);

        if (!empty($fields)) {
            foreach ($fields as $field) {
                $submission_data[$field['field_name']] = $field['field_value'];
            }
        } elseif (!empty($record['meta_data'])) {
            $meta_data = maybe_unserialize($record['meta_data']);
            if (!empty($meta_data['_form_data'])) {
                $submission_data = $meta_data['_form_data'];
            }
        }

        if (
            isset($submission_data['email']) &&
            strtolower(trim($submission_data['email'])) === strtolower(trim($email))
        ) {
            return $submission_data;
        }
    }

    return array();
}

/**
 * Format any date-ish string as dd/mm/yyyy for display. Mirrors the JS helper
 * window.atgFormatDDMMYYYY() in jetform-enhancement.js, so the review page,
 * thank-you page, and emails all show dates the same way regardless of what
 * format the value happens to be stored in ("2025-09-18", "18/09/2025", etc).
 *
 * @param string $date_str Raw date value from a submitted field.
 * @return string Date formatted as dd/mm/yyyy, or the original string if it
 *                can't be parsed as a date.
 */
/**
 * Format a number as GBP with thousands separators, e.g. 2140 -> "£2,140.00".
 * Mirrors the JS helper window.atgFormatCurrency() in jetform-enhancement.js.
 * Display only - never used on the raw field values that feed calculations.
 *
 * @param string|float $amount Raw amount, with or without a £ sign / commas already.
 * @return string Formatted as £X,XXX.XX.
 */
function atg_format_currency($amount) {
    $numeric = preg_replace('/[^0-9.\-]/', '', (string) $amount);
    if ($numeric === '' || $numeric === '-' || !is_numeric($numeric)) {
        return '£0.00';
    }
    return '£' . number_format((float) $numeric, 2);
}

function atg_format_ddmmyyyy($date_str) {
    $date_str = trim((string) $date_str);
    if ($date_str === '') {
        return $date_str;
    }

    // Already dd/mm/yyyy - leave as-is
    if (preg_match('/^\d{1,2}\/\d{1,2}\/\d{4}$/', $date_str)) {
        return $date_str;
    }

    // Strip time portion if present (e.g. "2025-09-18T00:00")
    $date_part = strpos($date_str, 'T') !== false ? strtok($date_str, 'T') : $date_str;

    foreach (array('Y-m-d', 'Y-n-j') as $format) {
        $dt = DateTime::createFromFormat($format, $date_part);
        if ($dt !== false) {
            return $dt->format('d/m/Y');
        }
    }

    // Fallback: let PHP try to parse it generically
    $timestamp = strtotime($date_str);
    if ($timestamp !== false) {
        return date('d/m/Y', $timestamp);
    }

    return $date_str;
}

/**
 * Parse any date-ish field value ("2025-09-18", "2025-09-18T00:00",
 * "18/09/2025") into a DateTime, or null if it can't be parsed. Shared by
 * atg_format_short_date()/atg_compute_travel_dates() below.
 *
 * @param string $date_str
 * @return DateTime|null
 */
function atg_parse_flexible_date($date_str) {
    $date_str = trim((string) $date_str);
    if ($date_str === '') {
        return null;
    }

    $date_part = strpos($date_str, 'T') !== false ? strtok($date_str, 'T') : $date_str;

    if (preg_match('/^\d{1,2}\/\d{1,2}\/\d{4}$/', $date_part)) {
        $dt = DateTime::createFromFormat('d/m/Y', $date_part);
        if ($dt !== false) {
            return $dt;
        }
    }

    // dd-mm-yyyy (dashes) - what the Departure Date flatpickr fields now
    // produce as of the JS dateFormat: "d-m-Y" hardcoding (2026-08-26).
    // Checked explicitly (not left to strtotime() below) since a dash-
    // separated date is genuinely ambiguous without a fixed field order -
    // strtotime() can't be trusted to always read it as day-first.
    if (preg_match('/^\d{1,2}-\d{1,2}-\d{4}$/', $date_part)) {
        $dt = DateTime::createFromFormat('d-m-Y', $date_part);
        if ($dt !== false) {
            return $dt;
        }
    }

    foreach (array('Y-m-d', 'Y-n-j') as $format) {
        $dt = DateTime::createFromFormat($format, $date_part);
        if ($dt !== false) {
            return $dt;
        }
    }

    $timestamp = strtotime($date_str);
    if ($timestamp !== false) {
        $dt = new DateTime();
        $dt->setTimestamp($timestamp);
        return $dt;
    }

    return null;
}

/**
 * Format any date-ish string as "29 Jul 26" - unambiguous regardless of
 * whether the reader expects UK (dd/mm) or US (mm/dd) ordering. This is what
 * the review page, thank-you page, and confirmation emails show;
 * atg_format_ddmmyyyy() above is kept only for anywhere still using dd/mm/yyyy.
 *
 * @param string $date_str Raw date value from a submitted field.
 * @return string Date formatted as "j M y", or the original string if it can't be parsed.
 */
function atg_format_short_date($date_str) {
    $dt = atg_parse_flexible_date($date_str);
    return $dt ? $dt->format('j M y') : (string) $date_str;
}

/**
 * Builds the "Travel Dates" range shown in place of a single "Departure
 * Date": start date is the submitted departure date; end date is start plus
 * the trip's number of nights. Nights come from whichever of these is
 * available - $itinerary_total_nights (customise form's summed Itinerary
 * rows) takes priority since it's an exact count, falling back to parsing
 * the leading number out of a "9 Day Itinerary"-style trip length label
 * (fixed-itinerary forms - "9 Day" means 9 days = 8 nights).
 *
 * @param string $departure_raw       Raw departure date field value.
 * @param string $trip_length_label   Trip length text (e.g. "9 Day Itinerary"), used as a fallback.
 * @param int    $itinerary_total_nights Summed nights from the customise form's Itinerary rows, or 0.
 * @return array {range: string, start: string, end: string} - end/range fall back to just the start date if nights can't be determined.
 */
function atg_compute_travel_dates($departure_raw, $trip_length_label = '', $itinerary_total_nights = 0) {
    $start_dt = atg_parse_flexible_date($departure_raw);
    if (!$start_dt) {
        return array('range' => '', 'start' => '', 'end' => '');
    }

    $start = $start_dt->format('j M y');

    $nights = null;
    if ($itinerary_total_nights > 0) {
        $nights = intval($itinerary_total_nights);
    } elseif (!empty($trip_length_label) && preg_match('/(\d+)\s*Day/i', $trip_length_label, $m)) {
        $nights = intval($m[1]) - 1;
    }

    if ($nights === null || $nights < 0) {
        return array('range' => $start, 'start' => $start, 'end' => '');
    }

    $end_dt = clone $start_dt;
    $end_dt->modify('+' . $nights . ' days');
    $end = $end_dt->format('j M y');

    return array('range' => $start . ' - ' . $end, 'start' => $start, 'end' => $end);
}

/**
 * Render the "Holiday Details / Lead Passenger Details / Room Details / Additional
 * Requests" boxes, using the exact same summary-wrapper / summary-container /
 * summary-title / summary-room-details-container classes as the booking review
 * page's summary (generateCompleteSummary() in jetform-enhancement.js). Sharing
 * markup means both pages are styled from the same CSS rules instead of twice.
 *
 * @param array $fields Associative array of submitted field_name => field_value.
 * @return string HTML for the summary sections (without the closing note box).
 */
/**
 * Read the "Itinerary" repeater (customise-itinerary form only - 31190 and
 * other fixed-trip forms don't have this field at all) out of a submitted
 * fields array, regardless of which of the two shapes it comes in as:
 *  - flat bracket-notation keys, e.g. $fields['Itinerary[0][hotel_location]']
 *    (how the DB records table / URL-style form data represents it)
 *  - a nested array under $fields['Itinerary'][0]['hotel_location']
 *    (how JetFormBuilder's own repeater parser resolves it via context)
 *
 * @param array $fields Associative array of submitted field_name => field_value.
 * @return array List of ['location' => ..., 'hotel' => ..., 'nights' => int] rows, in submitted order.
 */
function atg_extract_itinerary_rows($fields) {
    $rows = array();

    // Nested shape.
    if (!empty($fields['Itinerary']) && is_array($fields['Itinerary'])) {
        foreach ($fields['Itinerary'] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $rows[] = array(
                'location' => isset($row['hotel_location']) ? $row['hotel_location'] : '',
                'hotel'    => isset($row['hotel_name']) ? $row['hotel_name'] : '',
                'nights'   => isset($row['nights_at_this_hotel']) ? intval($row['nights_at_this_hotel']) : 0,
            );
        }
        if (!empty($rows)) {
            return $rows;
        }
    }

    // Flat bracket-notation shape.
    $i = 0;
    while (array_key_exists('Itinerary[' . $i . '][hotel_location]', $fields)) {
        $rows[] = array(
            'location' => $fields['Itinerary[' . $i . '][hotel_location]'],
            'hotel'    => isset($fields['Itinerary[' . $i . '][hotel_name]']) ? $fields['Itinerary[' . $i . '][hotel_name]'] : '',
            'nights'   => isset($fields['Itinerary[' . $i . '][nights_at_this_hotel]']) ? intval($fields['Itinerary[' . $i . '][nights_at_this_hotel]']) : 0,
        );
        $i++;
    }

    return $rows;
}

function atg_render_booking_detail_boxes($fields) {
    // ---- Holiday Details ----
    $post_id = 0;
    if (!empty($fields['post_id'])) {
        $post_id = intval($fields['post_id']);
    } elseif (!empty($fields['__queried_post_id'])) {
        $post_id = intval($fields['__queried_post_id']);
    }

    // Itinerary rows (customise form only) - listed under Holiday Details, and
    // summed into Trip Length instead of the fixed trip_duration_label those
    // forms don't have, mirroring generateCompleteSummary() in jetform-enhancement.js.
    $itinerary_rows = atg_extract_itinerary_rows($fields);
    $itinerary_html = '';
    $itinerary_total_nights = 0;
    foreach ($itinerary_rows as $row) {
        $itinerary_total_nights += $row['nights'];
        $itinerary_html .= '<div class="summary-itinerary-stop"><strong>' . esc_html($row['location'] ?: 'N/A') . '</strong>'
            . ($row['hotel'] !== '' ? ' &ndash; ' . esc_html($row['hotel']) : '')
            . ($row['nights'] ? ' &ndash; ' . esc_html($row['nights']) . ' night' . ($row['nights'] === 1 ? '' : 's') : '')
            . '</div>';
    }
    if ($itinerary_html !== '') {
        $itinerary_html = '<div class="summary-itinerary-list"><strong>Itinerary:</strong>' . $itinerary_html . '</div>';
    }

    $trip_length = !empty($itinerary_rows)
        ? ($itinerary_total_nights . ' night' . ($itinerary_total_nights === 1 ? '' : 's'))
        : (isset($fields['triptitle']) ? $fields['triptitle'] : '');
    $trip_selected = $post_id ? get_the_title($post_id) : '';
    if (empty($trip_selected)) {
        $trip_selected = isset($fields['triptitle']) ? $fields['triptitle'] : (!empty($itinerary_rows) ? 'Custom Itinerary Request' : '');
    }
    $travel_dates = atg_compute_travel_dates(
        isset($fields['_departure']) ? $fields['_departure'] : '',
        $trip_length,
        $itinerary_total_nights
    );
    $departure = esc_html($travel_dates['range']);

    // ---- Lead Passenger Details ----
    $lead_title = isset($fields['title_field']) ? $fields['title_field'] : '';
    $first_name = isset($fields['first_name']) ? $fields['first_name'] : '';
    $last_name = isset($fields['last_name']) ? $fields['last_name'] : '';
    $lead_name = esc_html(trim(preg_replace('/\s+/', ' ', $lead_title . ' ' . $first_name . ' ' . $last_name)));
    $email_display = isset($fields['email']) ? esc_html($fields['email']) : '';
    $phone = isset($fields['phone']) ? esc_html($fields['phone']) : '';
    $address = isset($fields['full_address']) && $fields['full_address'] !== '' ? nl2br(esc_html($fields['full_address'])) : 'N/A';

    // ---- Additional Requests ----
    $additional_requests = isset($fields['additional_requests']) ? trim($fields['additional_requests']) : '';

    // ---- Room Details: walk main room + each additional room, same as the review page ----
    $rooms_html = '';
    $total_passengers = 0;
    $i = 0;
    while (true) {
        $suffix = $i > 0 ? '_' . $i : '';
        $room_key = 'select_room' . $suffix;

        if (empty($fields[$room_key])) {
            break;
        }

        $room_type = rawRoomTypeToDisplayRoomType($fields[$room_key]);
        $passenger_count = isset($fields['number_of_passenger' . $suffix]) ? intval($fields['number_of_passenger' . $suffix]) : 0;
        $total_passengers += $passenger_count;
        $subtotal = isset($fields['sub_total' . $suffix]) ? atg_format_currency($fields['sub_total' . $suffix]) : '';

        // DOB (like Title/First/Last Name above) is only present in $fields via
        // the generic $_POST backfill hook, since it's not a real JetFormBuilder
        // field block - see the comment on jet-form-builder/form-record/save-record-action
        // further down. Client asked for it to show on the thank-you page and
        // review page too (2026-08-26), matching the email.
        $names = array();
        for ($j = 1; $j <= $passenger_count; $j++) {
            $t = isset($fields['passenger_title' . $suffix . '_' . $j]) ? $fields['passenger_title' . $suffix . '_' . $j] : '';
            $fn = isset($fields['passenger_first_name' . $suffix . '_' . $j]) ? $fields['passenger_first_name' . $suffix . '_' . $j] : '';
            $ln = isset($fields['passenger_last_name' . $suffix . '_' . $j]) ? $fields['passenger_last_name' . $suffix . '_' . $j] : '';
            $dob = isset($fields['passenger_dob' . $suffix . '_' . $j]) ? $fields['passenger_dob' . $suffix . '_' . $j] : '';
            $full = trim(preg_replace('/\s+/', ' ', $t . ' ' . $fn . ' ' . $ln));
            if ($dob !== '') {
                $full .= ' (DOB: ' . $dob . ')';
            }
            if ($full !== '') {
                $names[] = $full;
            }
        }

        $rooms_html .= '
            <div class="summary-room-details-container">
                <div class="summary-rd-room-type"><strong>Room Type:</strong> ' . esc_html($room_type) . '</div>
                <div class="summary-rd-passengers"><strong>Passengers:</strong> ' . esc_html($passenger_count) . '</div>
                <div class="summary-rd-subtotal"><strong>Subtotal:</strong> ' . $subtotal . '</div>
                <div class="summary-rd-passenger-names"><strong>Passenger Names:</strong> ' . esc_html(implode(', ', $names)) . '</div>
            </div>
        ';

        $i++;
    }

    if (empty($rooms_html)) {
        $rooms_html = '<div>No room data available</div>';
    }

    // "Deposit Paid: £400 (£200 per passenger)" - this is the thank-you page,
    // shown after the deposit has actually gone through, so it's "Paid" here
    // rather than "Due" (see atg_render_booking_detail_boxes_email() /
    // booking_summary_shortcode() for the review-page/email wording). The
    // per-passenger bracket is only shown for more than one passenger.
    $deposit_html = '';
    if (isset($fields['deposit']) && $fields['deposit'] !== '') {
        $deposit_total = (float) preg_replace('/[^0-9.]/', '', (string) $fields['deposit']);
        $per_passenger = $total_passengers > 0 ? $deposit_total / $total_passengers : $deposit_total;
        $deposit_html = '<div class="summary-deposit-due"><strong>Deposit Paid:</strong> ' . atg_format_currency($deposit_total)
            . ($total_passengers > 1 ? ' (' . atg_format_currency($per_passenger) . ' per passenger)' : '')
            . '</div>';
    }

    $additional_requests_html = '';
    if (!empty($additional_requests)) {
        $additional_requests_html = '
            <div class="summary-additional-requests">
                <div class="summary-container">
                    <div class="summary-title">Additional Requests</div>
                    <div>' . nl2br(esc_html($additional_requests)) . '</div>
                </div>
            </div>';
    }

    $html = '
        <div class="summary-wrapper">
            <div class="summary-holiday-details summary-inner-wrapper">
                <div class="summary-container">
                    <div class="summary-title">Holiday Details</div>
                    <div class="summary-trip-selected"><strong>Trip Selected:</strong> ' . esc_html($trip_selected) . '</div>
                    <div class="summary-trip-length"><strong>Trip Length:</strong> ' . esc_html($trip_length) . '</div>
                    <div class="summary-departure-date"><strong>Travel Dates:</strong> ' . $departure . '</div>
                    ' . $deposit_html . '
                    ' . $itinerary_html . '
                </div>
            </div>

            <div class="summary-lead-passenger summary-inner-wrapper">
                <div class="summary-container">
                    <div class="summary-title">Lead Passenger Details</div>
                    <div class="summary-lp-name"><strong>Name:</strong> ' . $lead_name . '</div>
                    <div class="summary-lp-email"><strong>Email:</strong> ' . $email_display . '</div>
                    <div class="summary-lp-phone"><strong>Phone:</strong> ' . $phone . '</div>
                    <div class="summary-lp-address"><strong>Address:</strong> ' . $address . '</div>
                </div>
            </div>
        </div>

        <div class="summary-room-details">
            <div class="summary-container">
                <div class="summary-title">Room Details</div>
                ' . $rooms_html . '
            </div>
        </div>
        ' . $additional_requests_html;

    // Note message, closing line, team name, phone, and email are all editable
    // under Settings > ATG Booking Settings instead of being hardcoded here.
    $settings = function_exists( 'atg_get_booking_settings' ) ? atg_get_booking_settings() : array();
    $note_message = isset($settings['atg_booking_note_message']) ? $settings['atg_booking_note_message'] : '';
    $note_closing_line = isset($settings['atg_booking_note_closing_line']) ? $settings['atg_booking_note_closing_line'] : '';
    $team_name = isset($settings['atg_footer_team_name']) ? $settings['atg_footer_team_name'] : 'ATG Reservations';
    $footer_phone = isset($settings['atg_footer_phone']) ? $settings['atg_footer_phone'] : '';
    $footer_email = isset($settings['atg_footer_email']) ? $settings['atg_footer_email'] : '';

    $html .= '
        <div class="summary-closing-note">
            <div class="summary-container">
                <p>' . nl2br(esc_html($note_message)) . '</p>
                <p><strong>' . esc_html($note_closing_line) . '</strong></p>
                <p><strong>' . esc_html($team_name) . '</strong></p>
                <p><strong>Tel: ' . esc_html($footer_phone) . '</strong></p>
                <p><strong>Email: ' . esc_html($footer_email) . '</strong></p>
            </div>
        </div>';

    return $html;
}

/**
 * Renders a "staff only" box with everything a customer-facing summary leaves out
 * (promo code, consent checkboxes, marketing opt-in, how they heard about us) so the
 * internal booking notification email gives Reservations the full picture to process it.
 *
 * @param array      $fields Associative array of submitted field_name => field_value.
 * @param int|string $ref    Booking reference (DB record ID) to display, if known.
 * @return string HTML for a ".booking-box full-width" section.
 */
function atg_render_staff_only_booking_info($fields, $ref = '') {
    $section_header_style = 'margin-bottom: 12px; font-size: 16px; font-weight: bold; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 5px;';
    $row_style = 'margin-bottom: 8px;';

    $how_heard_map = array(
        'travelled_previously' => 'Travelled with ATG previously',
        'word_of_mouth'        => 'Word of mouth',
        'referral_friend'      => 'Referral - friend',
        'referral_family'      => 'Referral - family',
        'internet'             => 'Internet search',
        'travel_agent'         => 'Travel Agent',
        'magazine'             => 'Magazine',
        'newspaper'            => 'Newspaper',
    );

    $promo_code = isset($fields['promo_code']) ? trim($fields['promo_code']) : '';
    $how_heard_raw = isset($fields['how_did_you_hear_about_us']) ? trim($fields['how_did_you_hear_about_us']) : '';
    $how_heard = $how_heard_raw !== ''
        ? (isset($how_heard_map[$how_heard_raw]) ? $how_heard_map[$how_heard_raw] : $how_heard_raw)
        : 'Not specified';

    $marketing_opt_in = !empty($fields['promotions_and_marketing_material']) ? 'Yes' : 'No';
    $booking_conditions = !empty($fields['accept_atg_booking_conditions']) ? 'Yes' : 'No';
    $privacy_policy = !empty($fields['accept_atg_privacy_policy']) ? 'Yes' : 'No';
    $travel_insurance = !empty($fields['travel_insurance']) ? 'Yes' : 'No';

    $html = '
        <div class="booking-box full-width" style="border: 2px solid #e67e22; background: #fff8f0;">
            <div style="' . $section_header_style . '">Additional Booking Information (Staff Only)</div>';

    if ($ref !== '') {
        $html .= '<div style="' . $row_style . '"><strong style="color: #333;">Reference:</strong> #' . esc_html($ref) . '</div>';
    }

    $html .= '
            <div style="' . $row_style . '"><strong style="color: #333;">Promo Code Used:</strong> ' . ($promo_code !== '' ? esc_html($promo_code) : 'None') . '</div>
            <div style="' . $row_style . '"><strong style="color: #333;">How Did You Hear About Us:</strong> ' . esc_html($how_heard) . '</div>
            <div style="' . $row_style . '"><strong style="color: #333;">Opted Into Marketing:</strong> ' . $marketing_opt_in . '</div>
            <div style="' . $row_style . '"><strong style="color: #333;">Accepted Booking Conditions:</strong> ' . $booking_conditions . '</div>
            <div style="' . $row_style . '"><strong style="color: #333;">Accepted Privacy Policy:</strong> ' . $privacy_policy . '</div>
            <div><strong style="color: #333;">Confirmed Travel Insurance:</strong> ' . $travel_insurance . '</div>
        </div>';

    return $html;
}

/**
 * ============================================================
 * Confirmation email HTML (beautified, email-client-safe).
 * ============================================================
 * wp_mail() bodies never load jetform-enhancement.css, so the on-page
 * summary markup (atg_render_booking_detail_boxes(), which relies entirely
 * on that stylesheet's .summary-* classes) was rendering as plain unstyled
 * text in an inbox - no card borders, no logo styling, no colour. These
 * functions rebuild the same information as a self-contained, table-based,
 * fully inline-styled email instead, since most inboxes strip <style>
 * blocks and many (Outlook especially) ignore external/embedded CSS
 * entirely. The on-page thank-you page output is untouched and still uses
 * atg_render_booking_detail_boxes() + the real stylesheet.
 */

define( 'ATG_EMAIL_ACCENT', '#FF6D00' );
define( 'ATG_EMAIL_DARK', '#1a2e27' );
define( 'ATG_EMAIL_TEXT', '#2c3e50' );
define( 'ATG_EMAIL_MUTED', '#5a6672' );
define( 'ATG_EMAIL_BORDER', '#e2e8f0' );
define( 'ATG_EMAIL_CARD_BG', '#f9fafb' );

/**
 * One "Label: value" line inside an email section card.
 *
 * @param string $label
 * @param string $value HTML-safe value (caller is responsible for escaping).
 * @param bool   $last  True to omit the bottom margin (last row in a card).
 * @return string
 */
function atg_email_row( $label, $value, $last = false ) {
    if ( $value === '' || $value === null ) {
        return '';
    }
    $margin = $last ? '0' : '0 0 8px';
    return '<div style="margin:' . $margin . ';font-size:14px;color:#333333;line-height:1.5;">'
        . '<strong style="color:' . ATG_EMAIL_DARK . ';">' . esc_html( $label ) . ':</strong> ' . $value
        . '</div>';
}

/**
 * A titled card (Holiday Details, Lead Passenger Details, etc.) - table-based
 * so it renders consistently in Outlook's Word-based HTML engine, not just
 * WebKit/Blink mail clients.
 */
function atg_email_section( $title, $inner_html ) {
    if ( trim( (string) $inner_html ) === '' ) {
        return '';
    }
    return '
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ' . ATG_EMAIL_BORDER . ';border-radius:6px;background-color:' . ATG_EMAIL_CARD_BG . ';">
            <tr>
                <td style="padding:16px 18px;">
                    <div style="font-size:14px;font-weight:700;color:' . ATG_EMAIL_DARK . ';border-bottom:2px solid ' . ATG_EMAIL_ACCENT . ';padding-bottom:8px;margin-bottom:12px;">' . esc_html( $title ) . '</div>
                    ' . $inner_html . '
                </td>
            </tr>
        </table>';
}

/**
 * Email version of atg_render_booking_detail_boxes() - same four sections,
 * same fields, but built with inline styles instead of .summary-* classes.
 *
 * @param array $fields       Associative array of submitted field_name => field_value.
 * @param bool  $show_pricing False omits the Subtotal row from each Room Details
 *                            card - used for the customise-itinerary form (31192),
 *                            which doesn't take payment and has no prices to show.
 * @return string Inline-styled HTML for the confirmation email body.
 */
function atg_render_booking_detail_boxes_email( $fields, $show_pricing = true ) {
    // ---- Holiday Details ----
    $post_id = 0;
    if ( ! empty( $fields['post_id'] ) ) {
        $post_id = intval( $fields['post_id'] );
    } elseif ( ! empty( $fields['__queried_post_id'] ) ) {
        $post_id = intval( $fields['__queried_post_id'] );
    }

    $itinerary_rows = atg_extract_itinerary_rows( $fields );
    $itinerary_total_nights = 0;
    $itinerary_inner = '';
    foreach ( $itinerary_rows as $row ) {
        $itinerary_total_nights += $row['nights'];
        $itinerary_inner .= '<div style="font-size:14px;color:#333333;margin:0 0 4px;">&bull; <strong style="color:' . ATG_EMAIL_DARK . ';">' . esc_html( $row['location'] ?: 'N/A' ) . '</strong>'
            . ( $row['hotel'] !== '' ? ' &ndash; ' . esc_html( $row['hotel'] ) : '' )
            . ( $row['nights'] ? ' &ndash; ' . esc_html( $row['nights'] ) . ' night' . ( $row['nights'] === 1 ? '' : 's' ) : '' )
            . '</div>';
    }
    if ( $itinerary_inner !== '' ) {
        $itinerary_inner = '<div style="margin-top:10px;padding-top:10px;border-top:1px solid ' . ATG_EMAIL_BORDER . ';">'
            . '<div style="font-size:13px;font-weight:700;color:' . ATG_EMAIL_DARK . ';margin-bottom:6px;">Itinerary</div>'
            . $itinerary_inner . '</div>';
    }

    $trip_length = ! empty( $itinerary_rows )
        ? ( $itinerary_total_nights . ' night' . ( $itinerary_total_nights === 1 ? '' : 's' ) )
        : ( isset( $fields['triptitle'] ) ? $fields['triptitle'] : '' );
    $trip_selected = $post_id ? get_the_title( $post_id ) : '';
    if ( empty( $trip_selected ) ) {
        $trip_selected = isset( $fields['triptitle'] ) ? $fields['triptitle'] : ( ! empty( $itinerary_rows ) ? 'Custom Itinerary Request' : '' );
    }
    $travel_dates = atg_compute_travel_dates(
        isset( $fields['_departure'] ) ? $fields['_departure'] : '',
        $trip_length,
        $itinerary_total_nights
    );
    $departure = esc_html( $travel_dates['range'] );

    $holiday_rows = atg_email_row( 'Trip Selected', esc_html( $trip_selected ) )
        . atg_email_row( 'Trip Length', esc_html( $trip_length ) )
        . atg_email_row( 'Travel Dates', $departure, $itinerary_inner === '' )
        . $itinerary_inner;

    // ---- Lead Passenger Details ----
    $lead_title = isset( $fields['title_field'] ) ? $fields['title_field'] : '';
    $first_name = isset( $fields['first_name'] ) ? $fields['first_name'] : '';
    $last_name = isset( $fields['last_name'] ) ? $fields['last_name'] : '';
    $lead_name = esc_html( trim( preg_replace( '/\s+/', ' ', $lead_title . ' ' . $first_name . ' ' . $last_name ) ) );
    $email_display = isset( $fields['email'] ) ? esc_html( $fields['email'] ) : '';
    $phone = isset( $fields['phone'] ) ? esc_html( $fields['phone'] ) : '';
    $address = isset( $fields['full_address'] ) && $fields['full_address'] !== '' ? nl2br( esc_html( $fields['full_address'] ) ) : 'N/A';

    $lead_rows = atg_email_row( 'Name', $lead_name )
        . atg_email_row( 'Email', $email_display )
        . atg_email_row( 'Phone', $phone )
        . atg_email_row( 'Address', $address, true );

    // ---- Room Details: main room + each additional room, own white card per room ----
    $room_cards = array();
    $i = 0;
    while ( true ) {
        $suffix = $i > 0 ? '_' . $i : '';
        $room_key = 'select_room' . $suffix;

        if ( empty( $fields[ $room_key ] ) ) {
            break;
        }

        $room_type = rawRoomTypeToDisplayRoomType( $fields[ $room_key ] );
        $passenger_count = isset( $fields[ 'number_of_passenger' . $suffix ] ) ? intval( $fields[ 'number_of_passenger' . $suffix ] ) : 0;
        $subtotal = isset( $fields[ 'sub_total' . $suffix ] ) ? atg_format_currency( $fields[ 'sub_total' . $suffix ] ) : '';

        // DOB (passenger_dob_N / passenger_dob_<room>_N) is a plain text field
        // typed as dd-mm-yyyy on the intake form (see the .atg-dob-input
        // auto-format logic in jetform-enhancement.js) - shown here, on the
        // thank-you page (atg_render_booking_detail_boxes(), same pattern),
        // and on the review page (generateCompleteSummary() in
        // jetform-enhancement.js, reads it live from the DOM). Like the name
        // fields above, it's not a real JetFormBuilder field block, so it's
        // only present in $fields via the generic $_POST backfill hook
        // (jet-form-builder/form-record/save-record-action, above).
        $names = array();
        for ( $j = 1; $j <= $passenger_count; $j++ ) {
            $t = isset( $fields[ 'passenger_title' . $suffix . '_' . $j ] ) ? $fields[ 'passenger_title' . $suffix . '_' . $j ] : '';
            $fn = isset( $fields[ 'passenger_first_name' . $suffix . '_' . $j ] ) ? $fields[ 'passenger_first_name' . $suffix . '_' . $j ] : '';
            $ln = isset( $fields[ 'passenger_last_name' . $suffix . '_' . $j ] ) ? $fields[ 'passenger_last_name' . $suffix . '_' . $j ] : '';
            $dob = isset( $fields[ 'passenger_dob' . $suffix . '_' . $j ] ) ? $fields[ 'passenger_dob' . $suffix . '_' . $j ] : '';
            $full = trim( preg_replace( '/\s+/', ' ', $t . ' ' . $fn . ' ' . $ln ) );
            if ( $dob !== '' ) {
                $full .= ' (DOB: ' . $dob . ')';
            }
            if ( $full !== '' ) {
                $names[] = $full;
            }
        }

        $room_cards[] = atg_email_row( 'Room Type', esc_html( $room_type ) )
            . atg_email_row( 'Passengers', esc_html( $passenger_count ) )
            . ( $show_pricing ? atg_email_row( 'Subtotal', $subtotal ) : '' )
            . atg_email_row( 'Passenger Names', esc_html( implode( ', ', $names ) ), true );

        $i++;
    }

    $rooms_inner = '';
    $room_card_count = count( $room_cards );
    foreach ( $room_cards as $idx => $card_rows ) {
        $margin = ( $idx === $room_card_count - 1 ) ? '0' : '0 0 12px';
        $rooms_inner .= '<div style="border:1px solid ' . ATG_EMAIL_BORDER . ';border-radius:6px;background-color:#ffffff;padding:14px 16px;margin:' . $margin . ';">' . $card_rows . '</div>';
    }
    if ( $rooms_inner === '' ) {
        $rooms_inner = '<div style="font-size:14px;color:#333333;">No room data available</div>';
    }

    // ---- Additional Requests ----
    $additional_requests = isset( $fields['additional_requests'] ) ? trim( $fields['additional_requests'] ) : '';
    $additional_html = '';
    if ( $additional_requests !== '' ) {
        $additional_html = atg_email_section( 'Additional Requests', '<div style="font-size:14px;color:#333333;line-height:1.6;">' . nl2br( esc_html( $additional_requests ) ) . '</div>' );
    }

    return atg_email_section( 'Holiday Details', $holiday_rows )
        . atg_email_section( 'Lead Passenger Details', $lead_rows )
        . atg_email_section( 'Room Details', $rooms_inner )
        . $additional_html;
}

/**
 * Email version of atg_render_staff_only_booking_info() - same fields
 * (promo code, consent checkboxes, marketing opt-in, how they heard about
 * us), styled as an orange-accented card consistent with the rest of the
 * email instead of ad-hoc inline styles.
 *
 * @param array      $fields Associative array of submitted field_name => field_value.
 * @param int|string $ref    Booking reference (DB record ID) to display, if known.
 * @return string HTML for a "staff only" card.
 */
function atg_render_staff_only_booking_info_email( $fields, $ref = '' ) {
    $how_heard_map = array(
        'travelled_previously' => 'Travelled with ATG previously',
        'word_of_mouth'        => 'Word of mouth',
        'referral_friend'      => 'Referral - friend',
        'referral_family'      => 'Referral - family',
        'internet'             => 'Internet search',
        'travel_agent'         => 'Travel Agent',
        'magazine'             => 'Magazine',
        'newspaper'            => 'Newspaper',
    );

    $promo_code = isset( $fields['promo_code'] ) ? trim( $fields['promo_code'] ) : '';
    $how_heard_raw = isset( $fields['how_did_you_hear_about_us'] ) ? trim( $fields['how_did_you_hear_about_us'] ) : '';
    $how_heard = $how_heard_raw !== ''
        ? ( isset( $how_heard_map[ $how_heard_raw ] ) ? $how_heard_map[ $how_heard_raw ] : $how_heard_raw )
        : 'Not specified';

    $marketing_opt_in = ! empty( $fields['promotions_and_marketing_material'] ) ? 'Yes' : 'No';
    $booking_conditions = ! empty( $fields['accept_atg_booking_conditions'] ) ? 'Yes' : 'No';
    $privacy_policy = ! empty( $fields['accept_atg_privacy_policy'] ) ? 'Yes' : 'No';
    $travel_insurance = ! empty( $fields['travel_insurance'] ) ? 'Yes' : 'No';

    $rows = '';
    if ( $ref !== '' ) {
        $rows .= atg_email_row( 'Reference', '#' . esc_html( $ref ) );
    }
    // Only shown when the customer actually entered a promo code - skip the
    // row entirely rather than displaying "Promo Code Used: None".
    if ( $promo_code !== '' ) {
        $rows .= atg_email_row( 'Promo Code Used', esc_html( $promo_code ) );
    }
    $rows .= atg_email_row( 'How Did You Hear About Us', esc_html( $how_heard ) )
        . atg_email_row( 'Opted Into Marketing', $marketing_opt_in )
        . atg_email_row( 'Accepted Booking Conditions', $booking_conditions )
        . atg_email_row( 'Accepted Privacy Policy', $privacy_policy )
        . atg_email_row( 'Confirmed Travel Insurance', $travel_insurance, true );

    return '
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #f0c39a;border-radius:6px;background-color:#fff8f0;">
            <tr>
                <td style="padding:16px 18px;">
                    <div style="font-size:14px;font-weight:700;color:#b35c00;border-bottom:2px solid ' . ATG_EMAIL_ACCENT . ';padding-bottom:8px;margin-bottom:12px;">Additional Booking Information (Staff Only)</div>
                    ' . $rows . '
                </td>
            </tr>
        </table>';
}

/**
 * Builds the greeting + headline + detail sections + closing note that goes
 * inside atg_build_confirmation_email()'s content cell. Shared by both
 * 31190's deposit-confirmation email and 31192's enquiry-confirmation email.
 *
 * @param string $greeting     "Dear Mr Smith," (already HTML-safe).
 * @param string $headline     Main confirmation sentence (already HTML-safe, may include inline markup).
 * @param string $trip_name    Trip/tour name - escaped internally.
 * @param array  $fields       Submitted field_name => field_value.
 * @param bool   $is_internal  True to also include the staff-only info card.
 * @param mixed  $ref          Booking/enquiry reference, only used when $is_internal is true.
 * @param bool   $show_pricing False omits the Subtotal row from Room Details - see
 *                             atg_render_booking_detail_boxes_email().
 * @return string
 */
function atg_build_confirmation_email_content( $greeting, $headline, $trip_name, $fields, $is_internal = false, $ref = '', $show_pricing = true ) {
    $settings = function_exists( 'atg_get_booking_settings' ) ? atg_get_booking_settings() : array();
    $note_message = isset( $settings['atg_booking_note_message'] ) ? $settings['atg_booking_note_message'] : '';
    $note_closing_line = isset( $settings['atg_booking_note_closing_line'] ) ? $settings['atg_booking_note_closing_line'] : '';

    $html = '<p style="margin:0 0 16px;font-size:15px;">' . $greeting . '</p>'
        . '<h2 style="margin:0 0 6px;font-size:18px;color:' . ATG_EMAIL_DARK . ';font-weight:700;line-height:1.4;">' . $headline . '</h2>'
        . '<h4 style="margin:0 0 24px;font-size:15px;color:' . ATG_EMAIL_ACCENT . ';font-weight:700;">' . esc_html( $trip_name ) . '</h4>'
        . atg_render_booking_detail_boxes_email( $fields, $show_pricing );

    if ( $is_internal ) {
        $html .= atg_render_staff_only_booking_info_email( $fields, $ref );
    }

    if ( $note_message !== '' || $note_closing_line !== '' ) {
        $html .= '<div style="margin-top:8px;padding-top:20px;border-top:1px solid ' . ATG_EMAIL_BORDER . ';font-size:13px;color:' . ATG_EMAIL_MUTED . ';line-height:1.6;">';
        if ( $note_message !== '' ) {
            $html .= '<p style="margin:0 0 10px;">' . nl2br( esc_html( $note_message ) ) . '</p>';
        }
        if ( $note_closing_line !== '' ) {
            $html .= '<p style="margin:0;font-weight:700;color:' . ATG_EMAIL_TEXT . ';">' . esc_html( $note_closing_line ) . '</p>';
        }
        $html .= '</div>';
    }

    return $html;
}

/**
 * Wraps confirmation-email content in a full, table-based HTML email shell:
 * branded dark-green header with the logo, the content cell, then a contact
 * footer band (team name/phone/email). Self-contained inline styles only -
 * no <style> block or external stylesheet, since most inboxes strip or
 * ignore both.
 *
 * @param string $inner_html Content built by atg_build_confirmation_email_content().
 * @param string $preheader  Optional short preview text shown next to the subject line in inbox lists.
 * @return string Full <html>...</html> document, ready to hand to wp_mail().
 */
function atg_build_confirmation_email( $inner_html, $preheader = '' ) {
    $settings = function_exists( 'atg_get_booking_settings' ) ? atg_get_booking_settings() : array();
    $logo_url = isset( $settings['atg_logo_url'] ) ? esc_url( $settings['atg_logo_url'] ) : '';
    $team_name = isset( $settings['atg_footer_team_name'] ) ? esc_html( $settings['atg_footer_team_name'] ) : 'ATG Reservations';
    $footer_phone = isset( $settings['atg_footer_phone'] ) ? esc_html( $settings['atg_footer_phone'] ) : '';
    $footer_email = isset( $settings['atg_footer_email'] ) ? esc_html( $settings['atg_footer_email'] ) : '';

    $preheader_html = '';
    if ( $preheader !== '' ) {
        $preheader_html = '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">' . esc_html( $preheader ) . '</div>';
    }

    $logo_html = $logo_url !== ''
        ? '<img src="' . $logo_url . '" alt="' . esc_attr( $team_name ) . '" width="150" style="display:block;margin:0 auto;max-width:150px;height:auto;border:0;">'
        : '<span style="color:#ffffff;font-size:18px;font-weight:700;">' . $team_name . '</span>';

    return '<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>' . $team_name . '</title>
</head>
<body style="margin:0;padding:0;background-color:#eef1f4;">
' . $preheader_html . '
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef1f4;">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:8px;border:1px solid ' . ATG_EMAIL_BORDER . ';font-family:Arial, Helvetica, sans-serif;">
<tr>
<td style="background-color:' . ATG_EMAIL_DARK . ';padding:26px 30px;text-align:center;border-radius:8px 8px 0 0;">
' . $logo_html . '
</td>
</tr>
<tr>
<td style="padding:32px 30px;color:' . ATG_EMAIL_TEXT . ';font-size:14px;line-height:1.6;">
' . $inner_html . '
</td>
</tr>
<tr>
<td style="background-color:#f4f6f8;border-top:1px solid ' . ATG_EMAIL_BORDER . ';border-radius:0 0 8px 8px;padding:20px 30px;text-align:center;">
<p style="margin:0 0 4px;font-weight:700;color:' . ATG_EMAIL_DARK . ';font-size:13px;">' . $team_name . '</p>
<p style="margin:0 0 2px;color:' . ATG_EMAIL_MUTED . ';font-size:12px;">Tel: ' . $footer_phone . '</p>
<p style="margin:0;color:' . ATG_EMAIL_MUTED . ';font-size:12px;">Email: <a href="mailto:' . $footer_email . '" style="color:' . ATG_EMAIL_ACCENT . ';text-decoration:none;">' . $footer_email . '</a></p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>';
}

function booking_summary_shortcode() {
    if (empty($_GET)) {
        return "<p>No booking details found.</p>";
    }

    global $wpdb;

    // Start with whatever the redirect URL carried, then overlay the full submitted
    // record (matched by email) - the DB record has every field the form collected.
    $get_fields = array();
    foreach ($_GET as $key => $value) {
        $get_fields[$key] = is_string($value) ? wp_unslash($value) : $value;
    }

    $email = isset($get_fields['email']) ? sanitize_email($get_fields['email']) : '';
    $submission = $email ? atg_get_latest_jetformbuilder_submission_by_email(31190, $email) : array();
    $fields = !empty($submission) ? array_merge($get_fields, $submission) : $get_fields;

    if (empty($fields)) {
        return "<p>No booking details found.</p>";
    }

    $deposit = isset($fields['deposit']) ? atg_format_currency($fields['deposit']) : '';
    $trip_length = isset($fields['triptitle']) ? esc_html($fields['triptitle']) : '';
    $return_url = esc_url(home_url('/'));

    // Logo, team name, phone, and contact email are editable under Settings > ATG
    // Booking Settings instead of being hardcoded in this file.
    $settings = function_exists( 'atg_get_booking_settings' ) ? atg_get_booking_settings() : array();
    $logo_url = isset($settings['atg_logo_url']) ? esc_url($settings['atg_logo_url']) : '';
    $team_name = isset($settings['atg_footer_team_name']) ? esc_html($settings['atg_footer_team_name']) : 'ATG Reservations';
    $footer_phone = isset($settings['atg_footer_phone']) ? esc_html($settings['atg_footer_phone']) : '';
    $footer_email = isset($settings['atg_footer_email']) ? esc_html($settings['atg_footer_email']) : '';

    // Send the confirmation emails (once per record) using its own full submission data.
    if ($email) {
        $fields_table = $wpdb->prefix . 'jet_fb_records_fields';
        $results = get_jetformbuilder_no_notification_records_by_email(31190, $email);
        foreach ($results as $result) {
            $ref = $result['id']; // DB record ID, used as the booking reference

            // Atomic lock: add_option() fails (returns false) if the option name already
            // exists, because wp_options.option_name has a UNIQUE key at the DB level.
            // This closes the race window in the "check not-yet-notified, then mark
            // notified" logic above - if two near-simultaneous requests both reach this
            // point for the same record, only the first one wins the lock and sends.
            if (!add_option('atg_booking_email_lock_' . $ref, time(), '', 'no')) {
                continue;
            }

            $formFields = $result['form_fields'];

            $emailDeposit = isset($formFields['deposit']) ? atg_format_currency($formFields['deposit']) : '';

            // Resolve the tour name the same way the page does (post title beats the raw triptitle field)
            $email_post_id = 0;
            if (!empty($formFields['post_id'])) {
                $email_post_id = intval($formFields['post_id']);
            } elseif (!empty($formFields['__queried_post_id'])) {
                $email_post_id = intval($formFields['__queried_post_id']);
            }
            // Keep this raw (unescaped) - it's used in the plain-text subject line as well
            // as the HTML body, so it gets esc_html()'d only where it's inserted into HTML.
            $tour_name = $email_post_id ? get_the_title($email_post_id) : '';
            if (empty($tour_name)) {
                $tour_name = isset($formFields['triptitle']) ? $formFields['triptitle'] : 'Tour';
            }

            // "Dear <<Title>> <<Surname>>" greeting
            $greet_title = isset($formFields['title_field']) ? trim($formFields['title_field']) : '';
            $greet_surname = isset($formFields['last_name']) ? trim($formFields['last_name']) : '';
            $greeting_name = trim($greet_title . ' ' . $greet_surname);
            $greeting = $greeting_name !== '' ? 'Dear ' . esc_html($greeting_name) . ',' : 'Dear Customer,';

            // Full lead name, for the internal subject line
            $lead_full_name = trim(preg_replace(
                '/\s+/',
                ' ',
                ($formFields['title_field'] ?? '') . ' ' . ($formFields['first_name'] ?? '') . ' ' . ($formFields['last_name'] ?? '')
            ));

            // Beautified, inline-styled HTML email (wp_mail() never loads
            // jetform-enhancement.css, so the .summary-* classes used by
            // atg_render_booking_detail_boxes() render unstyled in an inbox -
            // see atg_build_confirmation_email()/atg_build_confirmation_email_content()).
            $email_headline = 'Thank you for your deposit of <span style="color:' . ATG_EMAIL_ACCENT . ';font-weight:700;">' . $emailDeposit . '</span>, your booking is now being processed by our Reservations Team.';
            $email_trip_heading = 'Book ' . $tour_name;

            $emailContentCustomer = atg_build_confirmation_email(
                atg_build_confirmation_email_content( $greeting, $email_headline, $email_trip_heading, $formFields, false ),
                wp_strip_all_tags( $email_headline )
            );

            $emailContentInternal = atg_build_confirmation_email(
                atg_build_confirmation_email_content( $greeting, $email_headline, $email_trip_heading, $formFields, true, $ref ),
                wp_strip_all_tags( $email_headline )
            );

            $wpdb->insert($fields_table, array('record_id' => $result['id'], 'field_name' => 'email_notification', 'field_value' => 'yes'), array('%d', '%s', '%s'));

            $headers = array('Content-Type: text/html; charset=UTF-8');
            $client_subject = 'Booking Confirmation - #' . $ref . ' - ' . $tour_name;
            $internal_subject = 'New Booking Notification - #' . $ref . ' - ' . $tour_name . ' - ' . $lead_full_name;

            wp_mail($email, $client_subject, $emailContentCustomer, $headers);

            // Internal recipients are editable under Settings > ATG Booking Settings
            // (comma-separated list), rather than hardcoded email addresses here.
            $internal_recipients = function_exists( 'atg_get_internal_notification_emails' )
                ? atg_get_internal_notification_emails()
                : array( 'trip-enquiry@atg-oxford.com' );
            foreach ( $internal_recipients as $internal_recipient ) {
                wp_mail($internal_recipient, $internal_subject, $emailContentInternal, $headers);
            }
        }
    }

    // Build HTML for the page
    $output = '
    <div class="booking-summary">
	<div class="summary-logo-wrapper"><img class="booking-summary-logo" src="' . $logo_url . '"></div>
		<h2>Thank you for your deposit of <span>' . $deposit . '</span>, your booking is now being processed by our Reservations Team.</h2>
        ' . atg_render_booking_detail_boxes($fields) . '
		<div class="summary-btn">
			<a class="elementor-button elementor-button-link elementor-size-sm elementor-animation-shrink" href="' . $return_url . '">
			<span class="elementor-button-content-wrapper">
			<span class="elementor-button-text">Go to Homepage</span></span>
			</a>
		</div>
    </div>
    ';

    return $output;
}
add_shortcode('booking_summary', 'booking_summary_shortcode');

function rawRoomTypeToDisplayRoomType($room_type = ''){
    $room_type = (string) $room_type;
    if ($room_type === '') {
        return '';
    }
    // Mirrors the same substring checks used in generateCompleteSummary() (jetform-enhancement.js)
    // so both pages label rooms identically. Upgrade variants must be checked first -
    // "twin_room_upgrade" and "single_occupancy_upgrade" both contain the base room's
    // string too, so checking the base first would always match it and never reach
    // the upgrade case.
    if (strpos($room_type, 'double_upgrade') !== false) return 'Double Room (Upgrade)';
    if (strpos($room_type, 'twin_room_upgrade') !== false) return 'Twin Room (Upgrade)';
    if (strpos($room_type, 'single_occupancy_upgrade') !== false) return 'Single Occupancy (Double Room) (Upgrade)';
    if (strpos($room_type, 'double_room') !== false) return 'Double Room';
    if (strpos($room_type, 'twin_room') !== false) return 'Twin Room';
    if (strpos($room_type, 'single_occupancy') !== false) return 'Single Occupancy (Double Room)';
    return 'Unknown';
}

function rawSubtotalToDisplayTotal($subtotal_raw = '', $additional_rooms_raw = ''){
    $total_subtotal = 0;
    if (!empty($subtotal_raw)) {
        $numeric_subtotal = preg_replace('/[^0-9.]/', '', $subtotal_raw);
        $total_subtotal += floatval($numeric_subtotal);
    }
    if (!empty($additional_rooms_raw)) {
        $room_entries = preg_split('/Additional Room \d+:/', $additional_rooms_raw);
        foreach ($room_entries as $entry) {
            if (empty($entry)) continue;
            if (preg_match('/=\s*[£$\x{00A3}]?\s*([\d,]+\.?\d*)/u', $entry, $match)) {
                $clean_amount = str_replace(',', '', $match[1]);
                $total_subtotal += floatval($clean_amount);
            }
        }
    }
    return '£' . number_format($total_subtotal, 2); 
}

function rawPassengerNamesToDisplayNames($additional_rooms_raw = ''){
    $passenger_names = '';
    if (!empty($additional_rooms_raw)) {
        $rooms = preg_split('/(Additional Room \d+:)/', $additional_rooms_raw, -1, PREG_SPLIT_DELIM_CAPTURE);
        $formatted_rooms = '';
        for ($i = 1; $i < count($rooms); $i += 2) {
            if (isset($rooms[$i]) && isset($rooms[$i + 1])) {
                $room_header = $rooms[$i];
                $room_details = $rooms[$i + 1];
                $formatted_rooms .= '<strong>' . esc_html($room_header) . '</strong>' . nl2br(esc_html($room_details)) . '<br><br>';
            }
        }
        $passenger_names = $formatted_rooms;
    }
    if (empty($passenger_names)) {
        $passenger_names = 'No additional room data available';
    }
    return $passenger_names;
}

add_filter( 'jet-tabs/widget/loop-items', function( $items, $list, $widget ) {

  $settings = $widget->get_settings();
   
  if ( false === strpos( $settings['_css_classes'] ?? '', 'query-first-active' ) ) {
    return $items;
  }
   
  foreach ( $items as $key => $item ) {
    if ( ! $key ) {
      continue;
    }
    $items[ $key ]['item_active'] = false;
  }
   
  return $items;  

}, 1000, 3 );


// Location by Hotel
// Enqueue jQuery if not already loaded
add_action( 'wp_enqueue_scripts', function() {
    wp_enqueue_script( 'jquery' );
});

// Add custom JavaScript for dynamic filtering
add_action( 'wp_footer', function() {
    // Remove the is_page check or replace with your actual page ID/slug
    ?>
    <script type="text/javascript">
    jQuery(document).ready(function($) {
        ////console.log('Hotel filter script loaded'); // Debug line
        
        // When location field changes - using name="location"
        $('select[name="location"]').change(function() {
            //console.log('Location changed to:', $(this).val()); // Debug line
            
            var selectedLocation = $(this).val();
            
            if (selectedLocation) {
                // Show loading state - using name="hotel"
                $('select[name="hotel"]').html('<option value="">Loading hotels...</option>');
                
                // AJAX request to get filtered hotels
                $.ajax({
                    url: '<?php echo admin_url('admin-ajax.php'); ?>',
                    type: 'POST',
                    data: {
                        action: 'get_hotels_by_location',
                        location_id: selectedLocation,
                        nonce: '<?php echo wp_create_nonce('hotel_filter_nonce'); ?>'
                    },
                    success: function(response) {
                        //console.log('AJAX response:', response); // Debug line
                        if (response.success) {
                            var hotels = response.data;
                            var options = '<option value="">Select Hotel</option>';
                            
                            $.each(hotels, function(index, hotel) {
                                options += '<option value="' + hotel.id + '">' + hotel.title + '</option>';
                            });
                            
                            $('select[name="hotel"]').html(options);
                        } else {
                            $('select[name="hotel"]').html('<option value="">No hotels found</option>');
                        }
                    },
                    error: function(xhr, status, error) {
                        //console.log('AJAX error:', error); // Debug line
                        $('select[name="hotel"]').html('<option value="">Error loading hotels</option>');
                    }
                });
            } else {
                // Clear hotels if no location selected
                $('select[name="hotel"]').html('<option value="">Select Hotel</option>');
            }
        });
    });
    </script>
    <?php
});


// Enqueue jQuery
add_action( 'wp_enqueue_scripts', function() {
    wp_enqueue_script( 'jquery' );
});

// Add dynamic filtering JavaScript
add_action( 'wp_footer', function() {
    ?>
    <script type="text/javascript">
    jQuery(document).ready(function($) {
        // When location field changes
        $('select[name="location"]').change(function() {
            var selectedLocation = $(this).val();
            
            if (selectedLocation) {
                // Show loading
                $('select[name="hotel"]').html('<option value="">Loading hotels...</option>');
                
                // AJAX request
                $.ajax({
                    url: '<?php echo admin_url('admin-ajax.php'); ?>',
                    type: 'POST',
                    data: {
                        action: 'get_hotels_by_location',
                        location_id: selectedLocation,
                        nonce: '<?php echo wp_create_nonce('hotel_filter_nonce'); ?>'
                    },
                    success: function(response) {
                        if (response.success) {
                            var options = '<option value="">Select Hotel</option>';
                            $.each(response.data, function(index, hotel) {
                                options += '<option value="' + hotel.id + '">' + hotel.title + '</option>';
                            });
                            $('select[name="hotel"]').html(options);
                        }
                    },
                    error: function() {
                        $('select[name="hotel"]').html('<option value="">Error loading hotels</option>');
                    }
                });
            } else {
                $('select[name="hotel"]').html('<option value="">Select Location First</option>');
            }
        });
    });
    </script>
    <?php
});

// AJAX handler
add_action('wp_ajax_get_hotels_by_location', 'get_hotels_by_location');
add_action('wp_ajax_nopriv_get_hotels_by_location', 'get_hotels_by_location');

function get_hotels_by_location() {
    if (!wp_verify_nonce($_POST['nonce'], 'hotel_filter_nonce')) {
        wp_die('Security check failed');
    }
    
    $location_id = intval($_POST['location_id']);
    
    $args = array(
        'post_type' => 'hotel',
        'posts_per_page' => -1,
        'post_status' => 'publish',
        'tax_query' => array(
            array(
                'taxonomy' => 'test-location',
                'field' => 'term_id',
                'terms' => $location_id,
            )
        )
    );
    
    $hotels = get_posts($args);
    $hotel_data = array();
    
    foreach ($hotels as $hotel) {
        $hotel_data[] = array(
            'id' => $hotel->ID,
            'title' => $hotel->post_title
        );
    }
    
    wp_send_json_success($hotel_data);
}

function get_jetformbuilder_no_notification_records_by_email($form_id, $email) {
    global $wpdb;
    $records_table = $wpdb->prefix . 'jet_fb_records';
    $fields_table = $wpdb->prefix . 'jet_fb_records_fields';
    $records_query = $wpdb->prepare("SELECT * FROM $records_table WHERE form_id = %d",$form_id);
    $records = $wpdb->get_results($records_query, ARRAY_A);
    if (empty($records)) {
        return [];
    }

    $all_submissions = [];
    foreach ($records as $record) {
        $record_id = $record['id'];
        $fields_query = $wpdb->prepare("SELECT field_name, field_value FROM $fields_table WHERE record_id = %d",$record_id);
        $fields = $wpdb->get_results($fields_query, ARRAY_A);

        $submission_data = [];
        if (!empty($fields)) {
            foreach ($fields as $field) {
                $submission_data[$field['field_name']] = $field['field_value'];
            }
        } else {
            if (!empty($record['meta_data'])) {
                $meta_data = maybe_unserialize($record['meta_data']);
                if (!empty($meta_data['_form_data'])) {
                    $submission_data = $meta_data['_form_data'];
                }
            }
        }
        $record['form_fields'] = $submission_data;
        if(isset($record['form_fields']['email']) && $record['form_fields']['email'] == $email && !isset($record['form_fields']['email_notification'])){
            $all_submissions[] = $record;
        }
    }
    return $all_submissions;
}

/**
 * Stripe Checkout Session: make sure a Stripe Customer is created for every
 * deposit payment (customer_creation) and that the card used is saved for the
 * later balance payment (payment_intent_data.setup_future_usage), and prefill
 * the Checkout email from the "email" field on the lead customer step.
 *
 * The Stripe gateway plugin (jet-form-builder-stripe-gateway) fires
 * 'jet-form-builder/gateways/before-create' with the request object right
 * before it POSTs to /v1/checkout/sessions via wp_remote_post(). We read the
 * body it already built (mode/line_items/payment_method_types/urls) via the
 * public action_body() method, merge our extra params in, and hand the whole
 * thing back via set_body() - this avoids touching any vendor plugin file.
 *
 * NOTE: calling set_body() with ONLY the extra params (without first merging
 * action_body()'s output) would break checkout entirely - Base_Gateway_Action
 * only calls action_body() when its internal body is still empty, so a
 * premature/partial set_body() call silently drops mode/line_items/etc.
 */
add_action( 'jet-form-builder/gateways/before-create', 'atg_add_stripe_customer_params' );
function atg_add_stripe_customer_params( $request ) {
    if ( ! is_object( $request ) || ! method_exists( $request, 'action_body' ) || ! method_exists( $request, 'set_body' ) ) {
        return;
    }

    $body = $request->action_body();

    $body['customer_creation'] = 'always';
    $body['payment_intent_data'] = array(
        'setup_future_usage' => 'off_session',
    );

    if ( function_exists( 'jet_fb_context' ) ) {
        $email = jet_fb_context()->get_value( 'email' );
        if ( ! empty( $email ) && is_email( $email ) ) {
            $body['customer_email'] = sanitize_email( $email );
        }
    }

    $request->set_body( $body );
}

/**
 * Form 31192 (the customise-itinerary form) has JetFormBuilder's own built-in
 * "Send Email" action configured (mail_to: the customer's email field, BCC:
 * internal addresses) - but its content is a raw 4-line macro string
 * ("Departure: %expected_departure%..."), marked as text/html so the \n line
 * breaks don't even render, and it throws during processing (confirmed live:
 * submitting the form always returns {"status":"failed"} regardless of any
 * of our own hooks - this is pre-existing and not something we introduced).
 *
 * Rather than editing the form's stored action config in the database, strip
 * that action out of the run right before actions execute (form_actions is
 * already loaded by this point - see Form_Handler::send_form()) and replace
 * it with our own richer, working implementation below (atg_send_customize_form_emails()).
 */
add_action( 'jet-form-builder/form-handler/before-send', function( $form_handler ) {
    if ( ! is_object( $form_handler ) || ! method_exists( $form_handler, 'get_form_id' ) ) {
        return;
    }
    if ( (int) $form_handler->get_form_id() !== 31192 ) {
        return;
    }
    if ( isset( $form_handler->action_handler ) && method_exists( $form_handler->action_handler, 'unregister_action' ) ) {
        $form_handler->action_handler->unregister_action( 'send_email' );
    }
} );

/**
 * Root cause of "Passenger Names" (and previously Subtotal) silently missing
 * from BOTH forms' confirmation emails, despite being filled in and visible
 * on the review page: JetFormBuilder's own field-saving pipeline
 * (Controller::get_prepared_fields() in
 * modules/form-record/controller.php) walks jet_fb_context()->generate_request(),
 * which only knows about fields that are real JetFormBuilder field BLOCKS
 * registered on the form. The passenger_title_N / passenger_first_name_N /
 * passenger_last_name_N inputs are not blocks at all - they're raw
 * <input>s created at runtime by generatePassengerFields() /
 * generateAdditionalPassengerFields() (jetform-enhancement.js) once the
 * customer picks a room - so that pipeline never sees them, and they're
 * silently absent from *_jet_fb_records_fields even though they were
 * genuinely submitted. The review page doesn't have this problem because it
 * reads passenger names straight out of the live DOM instead (see the
 * comment on this in generateCompleteSummary()).
 *
 * This backfills any submitted $_POST field JetFormBuilder didn't already
 * save for a record, straight into *_jet_fb_records_fields, on every form's
 * submission (not just 31192's) - so every later reader of the saved record
 * (31190's thank-you-page/email pipeline, which queries this table on a
 * separate pageview after the original POST is long gone; any admin
 * tooling) sees the complete submission. Priority 5 so this has already run
 * by the time the two form-specific email-sending hooks below (both
 * priority 10, the default) read the data.
 */
add_action( 'jet-form-builder/form-record/save-record-action', function( $record_id, $request ) {
    global $wpdb;

    if ( empty( $record_id ) || empty( $_POST ) ) {
        return;
    }

    $fields_table = $wpdb->prefix . 'jet_fb_records_fields';

    $already_saved = $wpdb->get_col( $wpdb->prepare(
        "SELECT field_name FROM $fields_table WHERE record_id = %d",
        $record_id
    ) );
    $already_saved = array_flip( $already_saved );

    $skip_keys = array( '__form_id', '__refer', '__is_ajax', 'action', '_wp_http_referer' );

    foreach ( $_POST as $key => $value ) {
        if (
            isset( $already_saved[ $key ] ) ||
            in_array( $key, $skip_keys, true ) ||
            is_array( $value ) || // Nested fields (e.g. Itinerary[...]) are already handled by JFB's own pipeline.
            strpos( $key, '_jfb_' ) === 0 ||
            stripos( $key, 'nonce' ) !== false
        ) {
            continue;
        }

        $value = sanitize_text_field( wp_unslash( $value ) );
        if ( $value === '' ) {
            continue;
        }

        $wpdb->insert(
            $fields_table,
            array(
                'record_id'   => $record_id,
                'field_name'  => sanitize_text_field( $key ),
                'field_type'  => 'computed',
                'field_value' => $value,
            ),
            array( '%d', '%s', '%s', '%s' )
        );
    }
}, 5, 2 );

/**
 * Sends confirmation emails for form 31192 (customise-itinerary), mirroring
 * 31190's booking_summary_shortcode(): a customer copy plus a separate
 * internal/admin copy with an extra staff-only info box, both built from
 * atg_render_booking_detail_boxes() (shared with the review-page summary and
 * 31190's emails, so all three read identically for the same submission).
 *
 * Unlike 31190 - which only sends its emails when the customer's browser
 * *views* the thank-you page after a successful Stripe payment (there's no
 * such page/gateway for this form) - this fires directly off the save_record
 * action, exactly once per submission, via jet_fb_context()->resolve_request(),
 * which returns a flat field_name => value array (repeater fields like
 * "Itinerary" resolve to a nested array of rows) - see
 * Action_Handler::process_single_action() in jetformbuilder. Firing once per
 * submission (rather than once per page view) means the add_option() dedupe
 * lock 31190 needs doesn't apply here.
 */
add_action( 'jet-form-builder/form-record/save-record-action', function( $record_id, $request ) {
    if ( ! is_array( $request ) || (int) ( $request['__form_id'] ?? 0 ) !== 31192 ) {
        return;
    }

    // $request (jet_fb_context()->resolve_request()) only reflects real
    // JetFormBuilder field blocks - the passenger name fields aren't blocks
    // (see the backfill hook above), so they're missing from $request even
    // though they were genuinely submitted. Merge in $_POST as a fallback
    // for anything $request is missing, keeping $request's own resolved
    // values (proper types/sanitisation) as the source of truth wherever
    // both have the same key - this doesn't depend on the backfill hook
    // above having already run, so it's correct even if hook order ever
    // changes.
    $post_fallback = array();
    foreach ( $_POST as $post_key => $post_value ) {
        if ( ! is_array( $post_value ) ) {
            $post_fallback[ $post_key ] = sanitize_text_field( wp_unslash( $post_value ) );
        }
    }
    $fields = array_merge( $post_fallback, $request );
    $email = isset( $fields['email'] ) ? sanitize_email( $fields['email'] ) : '';
    if ( empty( $email ) ) {
        return;
    }

    $ref = $record_id; // DB record ID, used as the booking/enquiry reference.

    // Resolve the trip name the same way atg_render_booking_detail_boxes() does.
    $post_id = 0;
    if ( ! empty( $fields['post_id'] ) ) {
        $post_id = intval( $fields['post_id'] );
    } elseif ( ! empty( $fields['__queried_post_id'] ) ) {
        $post_id = intval( $fields['__queried_post_id'] );
    }
    $tour_name = $post_id ? get_the_title( $post_id ) : '';
    if ( empty( $tour_name ) ) {
        $tour_name = ! empty( $fields['triptitle'] ) ? $fields['triptitle'] : 'Custom Itinerary Request';
    }

    // "Dear <<Title>> <<Surname>>" greeting, same pattern as 31190's emails.
    $greet_title = isset( $fields['title_field'] ) ? trim( $fields['title_field'] ) : '';
    $greet_surname = isset( $fields['last_name'] ) ? trim( $fields['last_name'] ) : '';
    $greeting_name = trim( $greet_title . ' ' . $greet_surname );
    $greeting = $greeting_name !== '' ? 'Dear ' . esc_html( $greeting_name ) . ',' : 'Dear Customer,';

    // Full lead name, for the internal subject line.
    $lead_full_name = trim( preg_replace(
        '/\s+/',
        ' ',
        ( $fields['title_field'] ?? '' ) . ' ' . ( $fields['first_name'] ?? '' ) . ' ' . ( $fields['last_name'] ?? '' )
    ) );

    // No deposit line here (this form doesn't take payment) - just a plain
    // acknowledgement, matching the popup's own success message ("Thankyou
    // for submitting the information. We will get in touch with you with the
    // customised plan shortly."). Beautified, inline-styled HTML email - see
    // atg_build_confirmation_email()/atg_build_confirmation_email_content().
    $email_headline = 'Thank you for submitting your customised itinerary request &ndash; our Reservations Team will be in touch shortly with a bespoke quote.';

    // This form has no pricing (customer builds their own itinerary and gets
    // a bespoke quote back), so the Subtotal row is omitted from Room Details.
    $email_content_customer = atg_build_confirmation_email(
        atg_build_confirmation_email_content( $greeting, $email_headline, $tour_name, $fields, false, '', false ),
        wp_strip_all_tags( $email_headline )
    );

    $email_content_internal = atg_build_confirmation_email(
        atg_build_confirmation_email_content( $greeting, $email_headline, $tour_name, $fields, true, $ref, false ),
        wp_strip_all_tags( $email_headline )
    );

    $headers = array( 'Content-Type: text/html; charset=UTF-8' );
    $client_subject = 'Custom Itinerary Request Received - #' . $ref . ' - ' . $tour_name;
    $internal_subject = 'New Custom Itinerary Request - #' . $ref . ' - ' . $tour_name . ' - ' . $lead_full_name;

    wp_mail( $email, $client_subject, $email_content_customer, $headers );

    // Internal recipients are editable under Settings > ATG Booking Settings
    // (comma-separated list), same as 31190.
    $internal_recipients = function_exists( 'atg_get_internal_notification_emails' )
        ? atg_get_internal_notification_emails()
        : array( 'trip-enquiry@atg-oxford.com' );
    foreach ( $internal_recipients as $internal_recipient ) {
        wp_mail( $internal_recipient, $internal_subject, $email_content_internal, $headers );
    }
}, 10, 2 );
