<?php
/**
 * Admin Settings for ATG Oxford Helper
 * Lets the client edit deposit amounts and promo code behaviour from the
 * WordPress admin instead of a developer hardcoding them in JS/PHP.
 *
 * @package ATG Oxford Helper
 * @since 1.3.0
 */

// Exit if accessed directly
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Option keys used by this settings page, with their defaults.
 * Keeping this in one place makes it easy to read the current values
 * elsewhere in the plugin (see atg_get_booking_settings()).
 */
function atg_booking_settings_defaults() {
    return array(
        'atg_deposit_independent'              => 200,
        'atg_deposit_escorted'                  => 500,
        'atg_promo_code'                        => 'ATG10',
        'atg_promo_discount_percent'             => 10,
        'atg_promo_discount_applies_to_deposit'  => 0,
        'atg_logo_url'                           => 'https://atg-oxford.co.uk/BZFRM22/wp-content/uploads/2020/09/logo25.png',
        'atg_footer_team_name'                   => 'ATG Reservations',
        'atg_footer_phone'                       => '+44 (0)1865 315678',
        'atg_footer_email'                       => 'trip-enquiry@atg-oxford.com',
        'atg_internal_notification_emails'       => 'trip-enquiry@atg-oxford.com, jessicaj@atg-oxford.com',
        'atg_booking_note_message'               => 'On occasions it may take a few days before we receive all the responses required (from hotels etc) to confirm a booking. As soon as all the arrangements are in place, our Reservations Team look forward to sending you our Confirmation. In the meantime if you have and questions relating to your booking please do not hesitate to contact us.',
        'atg_booking_note_closing_line'          => 'You have chosen an excellent trip and we very much look forward to welcoming you.',
    );
}

/**
 * Parses the comma-separated internal notification emails option into a clean array.
 *
 * @return string[] Valid email addresses (deduplicated).
 */
function atg_get_internal_notification_emails() {
    $raw = get_option( 'atg_internal_notification_emails', atg_booking_settings_defaults()['atg_internal_notification_emails'] );
    $emails = array_map( 'trim', explode( ',', $raw ) );
    $emails = array_filter( $emails, function( $email ) {
        return is_email( $email );
    } );
    return array_values( array_unique( $emails ) );
}

/**
 * Convenience helper for reading all current booking settings at once
 * (used when localizing values to the frontend script).
 *
 * @return array
 */
function atg_get_booking_settings() {
    $defaults = atg_booking_settings_defaults();
    $settings = array();

    foreach ( $defaults as $key => $default ) {
        $settings[ $key ] = get_option( $key, $default );
    }

    return $settings;
}

add_action( 'admin_menu', function() {
    add_options_page(
        'ATG Booking Settings',
        'ATG Booking Settings',
        'manage_options',
        'atg-booking-settings',
        'atg_render_booking_settings_page'
    );
} );

add_action( 'admin_init', function() {
    $defaults = atg_booking_settings_defaults();

    register_setting( 'atg_booking_settings_group', 'atg_deposit_independent', array(
        'type'              => 'number',
        'sanitize_callback' => 'atg_sanitize_positive_number',
        'default'           => $defaults['atg_deposit_independent'],
    ) );

    register_setting( 'atg_booking_settings_group', 'atg_deposit_escorted', array(
        'type'              => 'number',
        'sanitize_callback' => 'atg_sanitize_positive_number',
        'default'           => $defaults['atg_deposit_escorted'],
    ) );

    register_setting( 'atg_booking_settings_group', 'atg_promo_code', array(
        'type'              => 'string',
        'sanitize_callback' => 'atg_sanitize_promo_code',
        'default'           => $defaults['atg_promo_code'],
    ) );

    register_setting( 'atg_booking_settings_group', 'atg_promo_discount_percent', array(
        'type'              => 'number',
        'sanitize_callback' => 'atg_sanitize_percent',
        'default'           => $defaults['atg_promo_discount_percent'],
    ) );

    register_setting( 'atg_booking_settings_group', 'atg_promo_discount_applies_to_deposit', array(
        'type'              => 'boolean',
        'sanitize_callback' => 'atg_sanitize_checkbox',
        'default'           => $defaults['atg_promo_discount_applies_to_deposit'],
    ) );

    add_settings_section(
        'atg_deposit_section',
        'Deposit Amounts',
        function() {
            echo '<p>The deposit is a fixed amount per passenger (not a percentage of the trip price).</p>';
        },
        'atg-booking-settings'
    );

    add_settings_field(
        'atg_deposit_independent',
        'Deposit per person - Independent trips (£)',
        'atg_render_number_field',
        'atg-booking-settings',
        'atg_deposit_section',
        array( 'option_name' => 'atg_deposit_independent', 'default' => $defaults['atg_deposit_independent'], 'step' => '0.01' )
    );

    add_settings_field(
        'atg_deposit_escorted',
        'Deposit per person - Escorted trips (£)',
        'atg_render_number_field',
        'atg-booking-settings',
        'atg_deposit_section',
        array( 'option_name' => 'atg_deposit_escorted', 'default' => $defaults['atg_deposit_escorted'], 'step' => '0.01' )
    );

    add_settings_section(
        'atg_promo_section',
        'Promo Code',
        function() {
            echo '<p>Controls the promo code customers can enter on the booking form.</p>';
        },
        'atg-booking-settings'
    );

    add_settings_field(
        'atg_promo_code',
        'Promo code',
        'atg_render_text_field',
        'atg-booking-settings',
        'atg_promo_section',
        array( 'option_name' => 'atg_promo_code', 'default' => $defaults['atg_promo_code'] )
    );

    add_settings_field(
        'atg_promo_discount_percent',
        'Discount (%)',
        'atg_render_number_field',
        'atg-booking-settings',
        'atg_promo_section',
        array( 'option_name' => 'atg_promo_discount_percent', 'default' => $defaults['atg_promo_discount_percent'], 'step' => '1', 'max' => '100' )
    );

    add_settings_field(
        'atg_promo_discount_applies_to_deposit',
        'Apply discount to the deposit too?',
        'atg_render_checkbox_field',
        'atg-booking-settings',
        'atg_promo_section',
        array(
            'option_name' => 'atg_promo_discount_applies_to_deposit',
            'default'     => $defaults['atg_promo_discount_applies_to_deposit'],
            'description' => 'If off, the promo code only discounts the Total Holiday Price (the balance due later) - today\'s deposit stays the fixed amount above. If on, the promo code also reduces the deposit itself by the same percentage.',
        )
    );

    register_setting( 'atg_booking_settings_group', 'atg_logo_url', array(
        'type'              => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'default'           => $defaults['atg_logo_url'],
    ) );

    register_setting( 'atg_booking_settings_group', 'atg_footer_team_name', array(
        'type'              => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default'           => $defaults['atg_footer_team_name'],
    ) );

    register_setting( 'atg_booking_settings_group', 'atg_footer_phone', array(
        'type'              => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default'           => $defaults['atg_footer_phone'],
    ) );

    register_setting( 'atg_booking_settings_group', 'atg_footer_email', array(
        'type'              => 'string',
        'sanitize_callback' => 'sanitize_email',
        'default'           => $defaults['atg_footer_email'],
    ) );

    register_setting( 'atg_booking_settings_group', 'atg_internal_notification_emails', array(
        'type'              => 'string',
        'sanitize_callback' => 'atg_sanitize_email_list',
        'default'           => $defaults['atg_internal_notification_emails'],
    ) );

    register_setting( 'atg_booking_settings_group', 'atg_booking_note_message', array(
        'type'              => 'string',
        'sanitize_callback' => 'sanitize_textarea_field',
        'default'           => $defaults['atg_booking_note_message'],
    ) );

    register_setting( 'atg_booking_settings_group', 'atg_booking_note_closing_line', array(
        'type'              => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default'           => $defaults['atg_booking_note_closing_line'],
    ) );

    add_settings_section(
        'atg_footer_section',
        'Footer & Contact Info',
        function() {
            echo '<p>Used in the logo, closing note, and footer shown on the review page, thank-you page, and confirmation emails.</p>';
        },
        'atg-booking-settings'
    );

    add_settings_field(
        'atg_logo_url',
        'Logo image URL',
        'atg_render_text_field',
        'atg-booking-settings',
        'atg_footer_section',
        array( 'option_name' => 'atg_logo_url', 'default' => $defaults['atg_logo_url'] )
    );

    add_settings_field(
        'atg_footer_team_name',
        'Team / signature name',
        'atg_render_text_field',
        'atg-booking-settings',
        'atg_footer_section',
        array( 'option_name' => 'atg_footer_team_name', 'default' => $defaults['atg_footer_team_name'] )
    );

    add_settings_field(
        'atg_footer_phone',
        'Contact phone',
        'atg_render_text_field',
        'atg-booking-settings',
        'atg_footer_section',
        array( 'option_name' => 'atg_footer_phone', 'default' => $defaults['atg_footer_phone'] )
    );

    add_settings_field(
        'atg_footer_email',
        'Contact email (shown to customers)',
        'atg_render_text_field',
        'atg-booking-settings',
        'atg_footer_section',
        array( 'option_name' => 'atg_footer_email', 'default' => $defaults['atg_footer_email'] )
    );

    add_settings_field(
        'atg_internal_notification_emails',
        'Internal notification email(s)',
        'atg_render_text_field',
        'atg-booking-settings',
        'atg_footer_section',
        array(
            'option_name' => 'atg_internal_notification_emails',
            'default'     => $defaults['atg_internal_notification_emails'],
            'description' => 'Comma-separated. These addresses get the "staff only" internal booking notification email (with promo code, consent checkboxes, etc.) - the customer does not.',
        )
    );

    add_settings_field(
        'atg_booking_note_message',
        'Note message',
        'atg_render_textarea_field',
        'atg-booking-settings',
        'atg_footer_section',
        array(
            'option_name' => 'atg_booking_note_message',
            'default'     => $defaults['atg_booking_note_message'],
            'description' => 'Shown above the closing line on the review page, thank-you page, and confirmation emails.',
        )
    );

    add_settings_field(
        'atg_booking_note_closing_line',
        'Closing line',
        'atg_render_text_field',
        'atg-booking-settings',
        'atg_footer_section',
        array( 'option_name' => 'atg_booking_note_closing_line', 'default' => $defaults['atg_booking_note_closing_line'] )
    );
} );

function atg_sanitize_positive_number( $value ) {
    $value = floatval( $value );
    return $value < 0 ? 0 : $value;
}

function atg_sanitize_percent( $value ) {
    $value = floatval( $value );
    if ( $value < 0 ) {
        return 0;
    }
    if ( $value > 100 ) {
        return 100;
    }
    return $value;
}

function atg_sanitize_promo_code( $value ) {
    $value = strtoupper( trim( sanitize_text_field( $value ) ) );
    return $value !== '' ? $value : 'ATG10';
}

function atg_sanitize_checkbox( $value ) {
    return ! empty( $value ) ? 1 : 0;
}

/**
 * Sanitizes a comma-separated list of emails, dropping anything that isn't
 * a valid address rather than silently storing garbage.
 */
function atg_sanitize_email_list( $value ) {
    $emails = array_map( 'trim', explode( ',', (string) $value ) );
    $emails = array_filter( $emails, function( $email ) {
        return is_email( $email );
    } );
    $emails = array_unique( $emails );
    return ! empty( $emails ) ? implode( ', ', $emails ) : 'trip-enquiry@atg-oxford.com';
}

function atg_render_text_field( $args ) {
    $value = get_option( $args['option_name'], $args['default'] );
    printf(
        '<input type="text" name="%1$s" value="%2$s" class="regular-text" />',
        esc_attr( $args['option_name'] ),
        esc_attr( $value )
    );
    if ( ! empty( $args['description'] ) ) {
        printf( '<p class="description">%s</p>', esc_html( $args['description'] ) );
    }
}

function atg_render_number_field( $args ) {
    $value = get_option( $args['option_name'], $args['default'] );
    $step = isset( $args['step'] ) ? $args['step'] : '1';
    $max_attr = isset( $args['max'] ) ? ' max="' . esc_attr( $args['max'] ) . '"' : '';
    printf(
        '<input type="number" step="%1$s" min="0"%2$s name="%3$s" value="%4$s" class="small-text" />',
        esc_attr( $step ),
        $max_attr,
        esc_attr( $args['option_name'] ),
        esc_attr( $value )
    );
}

function atg_render_textarea_field( $args ) {
    $value = get_option( $args['option_name'], $args['default'] );
    printf(
        '<textarea name="%1$s" rows="4" class="large-text">%2$s</textarea>',
        esc_attr( $args['option_name'] ),
        esc_textarea( $value )
    );
    if ( ! empty( $args['description'] ) ) {
        printf( '<p class="description">%s</p>', esc_html( $args['description'] ) );
    }
}

function atg_render_checkbox_field( $args ) {
    $value = get_option( $args['option_name'], $args['default'] );
    printf(
        '<label><input type="checkbox" name="%1$s" value="1" %2$s /> %3$s</label>',
        esc_attr( $args['option_name'] ),
        checked( 1, $value, false ),
        esc_html( $args['description'] )
    );
}

function atg_render_booking_settings_page() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }
    ?>
    <div class="wrap">
        <h1>ATG Booking Settings</h1>
        <form action="options.php" method="post">
            <?php
            settings_fields( 'atg_booking_settings_group' );
            do_settings_sections( 'atg-booking-settings' );
            submit_button();
            ?>
        </form>
    </div>
    <?php
}
