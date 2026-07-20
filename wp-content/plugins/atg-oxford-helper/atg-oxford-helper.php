<?php
/**
 * Plugin Name: ATG Oxford Helper
 * Description: Adds custom Flatpickr logic and enhancements for JetForm Builder inside Elementor popups.
 * Version: 1.2.11
 * Author: WPspin LLC
 * Author URI: https://wpspins.com/?atgoxfordjetengineplugin
 * Text Domain: jetform-enhancement
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'ATG_OXFORD_HELPER_VERSION', '1.2.11' );

// Include frontend data functionality.
require_once plugin_dir_path( __FILE__ ) . 'includes/frontend-data.php';

// Enqueue Flatpickr + custom JS/CSS.
add_action( 'wp_enqueue_scripts', function() {

    $plugin_url  = plugin_dir_url( __FILE__ );
    $plugin_path = plugin_dir_path( __FILE__ );

    // Flatpickr CSS/JS (keep CDN version static).
    wp_enqueue_style(
        'flatpickr',
        'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
        [],
        '4.6.13'
    );

    wp_enqueue_script(
        'flatpickr',
        'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js',
        [],
        '4.6.13',
        true
    );

    // Custom JS (cache-busting via filemtime).
    wp_enqueue_script(
        'jetform-enhancement',
        $plugin_url . 'assets/js/jetform-enhancement.js',
        [ 'jquery', 'flatpickr' ],
        filemtime( $plugin_path . 'assets/js/jetform-enhancement.js' ), 
        true
    );

    // Custom CSS (cache-busting via filemtime).
    wp_enqueue_style(
        'jetform-enhancement',
        $plugin_url . 'assets/css/jetform-enhancement.css',
        [],
        filemtime( $plugin_path . 'assets/css/jetform-enhancement.css' ) 
    );
});
