/**
 * District Commerce
 *
 * @category    District
 * @package     Stripe
 * @author      District Commerce <support@districtcommerce.com>
 * @copyright   Copyright (c) 2015 District Commerce (http://districtcommerce.com)
 *
 */

var district = district || {};

district.stripeCc = function ($) {

    var self = {},
        $inputs = {},
        inputsStr = '',
        mageValidateParent,
        address = {},
        cardsMap = {
            AE: 'amex',
            DI: 'discover',
            DC: 'dinersclub',
            JCB: 'jcb',
            MC: 'mastercard',
            VI: 'visa'
        },
        allowedCards = [],
        tokenValues = {
            cardNumber: '',
            cardExpiry: '',
            cardCVC: ''
        };

    /**
     * Initialize the form
     *
     * @param enabledCards
     */
    self.init = function (enabledCards) {

        //Setup enabled cards (specified in Magento Stripe config)
        self.setupEnabledCards(enabledCards);

        //Shortcut to elements
        $inputs.cardNumber = $('input#stripe_cc_number');
        $inputs.cardExpiry = $('input#stripe_cc_exp');
        $inputs.cardCVC = $('input#stripe_cc_cvc');
        $inputs.cardToken = $('input#stripe_token');
        $inputs.savedCard = $('input[name=stripeSavedCard]');
        $inputs.continueBtn = $('#payment-buttons-container button:first');

        //Set input mask for each field
        $inputs.cardNumber.payment('formatCardNumber');
        $inputs.cardExpiry.payment('formatCardExpiry');
        $inputs.cardCVC.payment('formatCardCVC');

        //Inputs String
        inputsStr = 'input#stripe_cc_number, input#stripe_cc_exp, input#stripe_cc_cvc';

        //Toggles error class based on validation result
        $.fn.toggleInputError = function (valid) {
            if(this.val().length) {
                this.parent().toggleClass('district-has-error', !valid);
            }
            return this;
        };

        //If no saved cards available, disable continue button by default
        if (!$inputs.savedCard.length) {
            self.disableContinueBtn(true);
        }

        //Toggle new card form
        $inputs.savedCard.change(function () {

            $inputs.savedCard
                .parent()
                .removeClass('district-label-active')
                .end()
                .filter($(this)).parent().addClass('district-label-active');

            if ($(this).val() === '') {
                $('#stripe-cards-select-new').show();
                $inputs.cardNumber.focus();
                if(self.newTokenRequired()) {
                    self.disableContinueBtn(true);
                }
            } else {
                $('#stripe-cards-select-new').hide();
                self.disableContinueBtn(false);
            }
        });

        //Validation Listener
        self.cardValidationListener();

        //If frontend payment
        if (typeof Payment !== 'undefined') {

            //Get billing address
            if (typeof billing !== 'undefined') {
                self.getBillingAddressFrontend();
            }

            //Bind keyup functions
            $('body').on('keyup', inputsStr, self.frontendKeyup);

            //Wrap the payment save method
            Payment.prototype.save = Payment.prototype.save.wrap(self.paymentSave);

        } else if (typeof AdminOrder !== 'undefined') { //Admin payment

            //Bind keyup functions
            $('body').on('keyup', inputsStr, self.adminKeyup);

            //Wrap get payment data method
            AdminOrder.prototype.getPaymentData = AdminOrder.prototype.getPaymentData.wrap(self.paymentDataChange);

        }

    };

    /**
     * Functions to run on input keyup on frontend
     *
     */
    self.frontendKeyup = function () {
        self.disableContinueBtn(true);
        self.delay(self.cardEntryListener, 750);
        self.showLabel($(this));
    };

    /**
     * Functions to run on input keyup on admin
     *
     */
    self.adminKeyup = function () {
        self.showLabel($(this));
    };

    /**
     * Shows label as placeholder
     *
     * @param $el
     */
    self.showLabel = function ($el) {
        $el.parents('li').toggleClass('district-show_label', !!$el.val().length);
    };

    /**
     * Delay function
     *
     */
    self.delay = (function () {
        var timer = 0;
        return function (callback, ms) {
            clearTimeout(timer);
            timer = setTimeout(callback, ms);
        };
    })();

    /**
     * Listener for when card is being entered
     *
     */
    self.cardEntryListener = function () {

        //If card is valid and if we need a new token
        if (self.validCard()) {
            $('#payment_form_stripe_cc .district-has-error').removeClass('district-has-error');
            if (self.newTokenRequired()) {
                self.createToken();
            } else {
                self.disableContinueBtn(false);
            }
        }

    };

    /**
     * Show validation errors
     *
     */
    self.cardValidationListener = function () {

        $('body').on('blur', 'input#stripe_cc_number', function () {
            $(this).toggleInputError(self.validateCardNumber());
        });

        $('body').on('blur', 'input#stripe_cc_exp', function () {
            $(this).toggleInputError(self.validateCardExpiry());
        });

        $('body').on('blur', 'input#stripe_cc_cvc', function () {
            $(this).toggleInputError(self.validateCardCVC());
        });

    };

    /**
     * Disable continue button
     *
     * @param state
     */
    self.disableContinueBtn = function (state) {
        $inputs.continueBtn.prop('disabled', state).toggleClass('disabled', state);
    };

    /**
     * Check if card is valid
     *
     * @returns {boolean}
     */
    self.validCard = function () {

        //Final check
        if (self.validateCardNumber() && self.validateCardExpiry() && self.validateCardCVC()) {
            return true;
        } else {
            return false;
        }

    };

    /**
     * Validate card number
     *
     * @returns {boolean}
     */
    self.validateCardNumber = function () {

        //Set vars
        var cardNumber = $.trim($inputs.cardNumber.val()),
            valid = false;

        //Validate
        if (cardNumber !== '' && cardNumber.replace(/ /g, '').length > 12) {
            valid = $.payment.validateCardNumber(cardNumber);
        }

        return valid;
    };

    /**
     * Validate card expiry
     *
     * @returns {boolean}
     */
    self.validateCardExpiry = function () {

        //Set vars
        var cardExpiry = $.trim($inputs.cardExpiry.val()),
            valid = false;

        //Validate
        if (cardExpiry !== '' && cardExpiry.length > 6) {
            valid = $.payment.validateCardExpiry($.payment.cardExpiryVal(cardExpiry));
        }

        return valid;

    };

    /**
     * Validate card CVC
     *
     * @returns {boolean}
     */
    self.validateCardCVC = function () {

        //Set vars
        var cardCVC = $.trim($inputs.cardCVC.val()),
            valid = false;

        //Validate
        if (cardCVC !== '' && cardCVC.length > 2) {
            valid = $.payment.validateCardCVC(cardCVC, $.payment.cardType($inputs.cardNumber.val()));
        }

        return valid;

    };

    /**
     * Determine if a new token is needed
     *
     * @returns {boolean}
     */
    self.newTokenRequired = function () {

        //If any value is different from previous token values, it's a new card
        if ($.trim($inputs.cardNumber.val()) !== tokenValues.cardNumber ||
            $.trim($inputs.cardExpiry.val()) !== tokenValues.cardExpiry ||
            $.trim($inputs.cardCVC.val()) !== tokenValues.cardCVC) {
            return true;
        } else {
            return false;
        }

    };

    /**
     * Stores enabled cards based on module settings
     *
     * @param enabledCards
     */
    self.setupEnabledCards = function (enabledCards) {

        //Split string of cards into array
        var enabledCardsArr = enabledCards.split(',');

        //Loop through each
        $.each(cardsMap, function (mageKey, stripeKey) {
            if ($.inArray(mageKey, enabledCardsArr) > -1) {
                allowedCards.push(stripeKey);
            }
        });

    };

    /**
     * Runs when updating payment form in admin
     *
     * @param getPaymentData
     */
    self.paymentDataChange = function (getPaymentData) {

        self.cardEntryListener();
        self.getBillingAddressAdmin();

        getPaymentData();

    };

    /**
     * Get billing address in frontend
     *
     */
    self.getBillingAddressFrontend = function () {

        //Get billing address select element
        var $billingAddress = $('#billing-address-select');

        //If the element exists and the value is not empty
        if ($billingAddress.length && $billingAddress.val() != '') {
            $.ajax({
                url: billing.addressUrl + $billingAddress.val()
            }).done(function (data) {
                address.line1 = data.street1;
                address.zip = data.postcode;
                address.country = data.country_id;
                address.name = data.firstname + ' ' + data.lastname
            });
        } else {
            address.line1 = $('#billing\\:street1').val();
            address.zip = $('#billing\\:postcode').val();
            address.country = $('#billing\\:country_id').val();
            address.name = $('billing\\:firstname').val() + ' ' + $('billing\\:lastname').val();
        }

    };

    /**
     * Get billing address in admin
     *
     */
    self.getBillingAddressAdmin = function () {

        address.line1 = $('#order-billing_address_street0').val();
        address.zip = $('#order-billing_address_postcode').val();
        address.country = $('#order-billing_address_country_id').val();
        address.name = $('#order-billing_address_firstname').val() + ' ' + $('#order-billing_address_lastname').val();

    };

    /**
     * Validate the form
     *
     * @param validateParent
     * @returns {boolean}
     */
    self.paymentSave = function (validateParent) {

        //Save ref to magento parent function (we need it in stripe callback)
        mageValidateParent = validateParent;

        if ($inputs.savedCard.length && $inputs.savedCard.val() !== '') { //Existing card to be used

            //Run Magento payment save function
            mageValidateParent();

        } else { //New card to be used

            //Check card is valid
            if (!self.validCard()) {
                return false;
            }

            //Check card type is allowed
            var cardType = $.payment.cardType($inputs.cardNumber.val());
            if ($.inArray(cardType, allowedCards) < 0) {
                window.alert(Translator.translate('Sorry, ' + cardType + ' is not currently accepted. Please use a different card.').stripTags());
                return false;
            }

            //Run Magento payment save function
            mageValidateParent();
        }

    };

    /**
     * Creates stripe token
     *
     */
    self.createToken = function () {

        //Get the token
        Stripe.card.createToken({
            number: $inputs.cardNumber.val(),
            exp: $inputs.cardExpiry.val(),
            cvc: $inputs.cardCVC.val(),
            address_country: address.country,
            address_line1: address.line1,
            address_zip: address.zip,
            name: address.name
        }, self.stripeResponseHandler);

    };

    /**
     * Handle response from stripe
     *
     * @param status
     * @param response
     */
    self.stripeResponseHandler = function (status, response) {

        //Handle response
        if (response.error) {
            $('#stripe-error-messages').html(response.error.message);
        } else {

            //Save token values
            tokenValues.cardNumber = $.trim($inputs.cardNumber.val());
            tokenValues.cardExpiry = $.trim($inputs.cardExpiry.val());
            tokenValues.cardCVC = $.trim($inputs.cardCVC.val());

            //Add token to form
            $inputs.cardToken.val(response.id);

            //Enable continue button
            self.disableContinueBtn(false);
        }

    };

    return self;

}(window.district.$ || window.jQuery);
