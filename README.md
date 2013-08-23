# seneca-pay - Node.js module
 
## Payments plugin for <a href="https://github.com/rjrodger/seneca">Seneca</a>

Includes support for paypal express payments.

NOTE: documentation is in progress. Take a look at the <a href="http://github.com/rjrodger/seneca-examples">payment gateway example</a>.

### Usage

     seneca.use('seneca-pay',{
        paypal: {
          useSandbox: true/false,
          username: 'paypal-api-account-username',
          password: 'paypal-api-account-password',
          signature: 'paypal-api-account-signature'
        },
        redirect: {
          hostUrl: 'http://www.mywebsite.com',
          success: '/completed',
          fail: '/cancelled'
        }
     })

    
    
