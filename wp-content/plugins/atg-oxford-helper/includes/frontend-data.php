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

        // Enqueue tour data reader JavaScript
        wp_enqueue_script(
            'tour-data-reader',
            plugin_dir_url( dirname( __FILE__ ) ) . 'assets/js/tour-data-reader.js',
            array( 'jquery' ),
            ATG_OXFORD_HELPER_VERSION,
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
function booking_summary_shortcode() {
    if (empty($_GET)) {
        return "<p>No booking details found.</p>";
    }

    global $wpdb;
    // Collect data from query string
    $trip_title = isset($_GET['triptitle']) ? esc_html($_GET['triptitle']) : '';
    $departure = isset($_GET['_departure']) ? esc_html($_GET['_departure']) : '';
    $deposit = isset($_GET['deposit']) ? esc_html($_GET['deposit']) : '';
    $first_name = isset($_GET['first_name']) ? esc_html($_GET['first_name']) : '';
    $last_name = isset($_GET['last_name']) ? esc_html($_GET['last_name']) : '';
    $email = isset($_GET['email']) ? esc_html($_GET['email']) : '';
    $phone = isset($_GET['phone']) ? esc_html($_GET['phone']) : '';
    $room_type_raw = isset($_GET['select_room']) ? esc_html($_GET['select_room']) : '';
    $passengers = isset($_GET['number_of_passenger']) ? esc_html($_GET['number_of_passenger']) : '';
    $subtotal_raw = isset($_GET['sub_total']) ? $_GET['sub_total'] : '';
    $passenger_data_raw = isset($_GET['passenger_data']) ? urldecode($_GET['passenger_data']) : '';
    $additional_rooms_raw = isset($_GET['additional_rooms']) ? urldecode($_GET['additional_rooms']) : '';
    $return_url = esc_url(home_url('/'));

    // Format room type: Remove "0_" prefix, replace underscores with spaces, capitalize
    $room_type = $room_type_raw;
    if (!empty($room_type)) {
        // Remove number prefix (e.g., "0_", "1_", etc.)
        $room_type = preg_replace('/^\d+_/', '', $room_type);
        // Replace underscores with spaces
        $room_type = str_replace('_', ' ', $room_type);
        // Capitalize each word
        $room_type = ucwords($room_type);
    }

    // Calculate total subtotal (main room + additional rooms)
    $total_subtotal = 0;

    // Extract numeric value from main subtotal
    if (!empty($subtotal_raw)) {
        $numeric_subtotal = preg_replace('/[^0-9.]/', '', $subtotal_raw);
        $total_subtotal += floatval($numeric_subtotal);
    }

    // Parse additional rooms and sum their subtotals
    if (!empty($additional_rooms_raw)) {
        // Split by "Additional Room" to get individual room entries
        $room_entries = preg_split('/Additional Room \d+:/', $additional_rooms_raw);

        foreach ($room_entries as $entry) {
            if (empty($entry)) continue;

            // Find the subtotal amount after "= " in each room entry
            // This ensures we only get the final total, not the per-unit price
            if (preg_match('/=\s*[£$\x{00A3}]?\s*([\d,]+\.?\d*)/u', $entry, $match)) {
                $clean_amount = str_replace(',', '', $match[1]);
                $total_subtotal += floatval($clean_amount);
            }
        }
    }

    $subtotal = '£' . number_format($total_subtotal, 2);

    // Process passenger and room information from additional_rooms parameter
    $passenger_names = '';
    if (!empty($additional_rooms_raw)) {
        // Format the additional rooms data for better display
        // Split by "Additional Room" to separate each room
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

    // If still empty, show a message
    if (empty($passenger_names)) {
        $passenger_names = 'No additional room data available';
    }

    if($email){
        $formId = 31190;
        $fields_table = $wpdb->prefix . 'jet_fb_records_fields';
        $results = get_jetformbuilder_no_notification_records_by_email($formId, $email);
        foreach($results as $result){
            $formFields = $result['form_fields'];
            $emailContent = '<div class="booking-summary">
            <div class="summary-logo-wrapper"><img class="booking-summary-logo" src="https://atg-oxford.co.uk/BZFRM22/wp-content/uploads/2020/09/logo25.png"></div>
                <h2>Thank you for your deposit of £<span>' . $formFields['deposit'] . '</span>, your booking is now being processed by our Reservations Team.</h2>
                <h4 class="booking-summary-deposit">Book ' . $formFields['triptitle'] . '</h4>
                <div class="booking-grid">
                    <div class="booking-box">
                        <h3>Holiday Details</h3>
                        <p><strong>Departure Date:</strong> ' . $formFields['_departure'] . '</p>
                        <p><strong>Deposit:</strong> £' . $formFields['deposit'] . '</p>
                    </div>
                    <div class="booking-box">
                        <h3>Lead Passenger Details</h3>
                        <p><strong>Name:</strong> ' . $formFields['first_name'] . ' ' . $formFields['last_name'] . '</p>
                        <p><strong>Email:</strong> ' . $email . '</p>
                        <p><strong>Phone:</strong> ' . $formFields['phone'] . '</p>
                    </div>
                    <div class="booking-box full-width">
                        <h3>Room Details</h3>
                        <p><strong>Selected First Room:</strong> ' . rawRoomTypeToDisplayRoomType($formFields['select_room']) . '</p>
                        <p><strong>Number of passenger in first room:</strong> ' . $formFields['number_of_passenger'] . '</p>
                        <p><strong>Total Holiday cost:</strong> ' . rawSubtotalToDisplayTotal($formFields['sub_total'],$formFields['additional_rooms']) . '</p>
                        <p><strong>Passengers` Data & Additional Passengers:</strong> <br>' . rawPassengerNamesToDisplayNames($formFields['additional_rooms']) . '</p>
                    </div>
                    <div class="booking-box full-width">
                        <p>On occasions it may take a few days before we receive all the responses required (from hotels etc) to confirm a booking. As soon as all the arrangements are in place, our Reservations Team look forward to sending you our Confirmation. In the meantime if you have and questions relating to your booking please do not hesitate to contact us.</p>
                        <p><strong>You have chosen an excellent trip and we very much look forward to welcoming you.</strong></p>
                        <p><strong>ATG Reservations</strong></p>
                        <p><strong>Tel: +44 (0)1865 315678</strong></p>
                        <p><strong>Email: trip-enquiry@atg-oxford.com</strong></p>
                    </div>
                </div>
            </div>';
            $wpdb->insert($fields_table,array('record_id' => $result['id'],'field_name' => 'email_notification','field_value' => 'yes'),array('%d', '%s', '%s'));

            $subject = 'Booking is now being processed';
            $headers = array('Content-Type: text/html; charset=UTF-8');
            wp_mail($email, $subject, $emailContent, $headers);
            wp_mail('trip-enquiry@atg-oxford.com', $subject, $emailContent, $headers);
            wp_mail('jessicaj@atg-oxford.com', $subject, $emailContent, $headers);
        }
    }


    // Build HTML
    $output = '
    <div class="booking-summary">
	<div class="summary-logo-wrapper"><img class="booking-summary-logo" src="https://atg-oxford.co.uk/BZFRM22/wp-content/uploads/2020/09/logo25.png"></div>
		<h2>Thank you for your deposit of £<span>' . $deposit . '</span>, your booking is now being processed by our Reservations Team.</h2>
		<h4 class="booking-summary-deposit">Book ' . $trip_title . '</h4>
        <div class="booking-grid">
            <div class="booking-box">
                <h3>Holiday Details</h3>
                <p><strong>Departure Date:</strong> ' . $departure . '</p>
                <p><strong>Deposit:</strong> £' . $deposit . '</p>
            </div>
            <div class="booking-box">
                <h3>Lead Passenger Details</h3>
                <p><strong>Name:</strong> ' . $first_name . ' ' . $last_name . '</p>
                <p><strong>Email:</strong> ' . $email . '</p>
                <p><strong>Phone:</strong> ' . $phone . '</p>
            </div>
            <div class="booking-box full-width">
                <h3>Room Details</h3>
                <p><strong>Selected First Room:</strong> ' . $room_type . '</p>
                <p><strong>Number of passenger in first room:</strong> ' . $passengers . '</p>
                <p><strong>Total Holiday cost:</strong> ' . $subtotal . '</p>
                <p><strong>Passengers` Data & Additional Passengers:</strong> <br>' . $passenger_names . '</p>
            </div>
            <div class="booking-box full-width">
                <p>On occasions it may take a few days before we receive all the responses required (from hotels etc) to confirm a booking. As soon as all the arrangements are in place, our Reservations Team look forward to sending you our Confirmation. In the meantime if you have and questions relating to your booking please do not hesitate to contact us.</p>
                <p><strong>You have chosen an excellent trip and we very much look forward to welcoming you.</strong></p>
                <p><strong>ATG Reservations</strong></p>
                <p><strong>Tel: +44 (0)1865 315678</strong></p>
                <p><strong>Email: trip-enquiry@atg-oxford.com</strong></p>
            </div>
        </div>
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
    if (!empty($room_type)) {
        $room_type = preg_replace('/^\d+_/', '', $room_type);
        $room_type = str_replace('_', ' ', $room_type);
        $room_type = ucwords($room_type);
    }
    return $room_type;
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
