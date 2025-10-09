// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.
//

export const environment = {
  urlPaymentez: 'https://ccapi-stg.paymentez.com/v2',
  dolarvzla: 'https://api.dolarvzla.com/public/exchange-rate',
  production: false,
  firebaseConfig: {
    apiKey: "AIzaSyBLTB4Zkc7DlD9y4OfNlawQYdlZnjtnXEo",
    authDomain: "driverappve.firebaseapp.com",
    projectId: "driverappve",
    storageBucket: "driverappve.firebasestorage.app",
    messagingSenderId: "441354356093",
    appId: "1:441354356093:web:3dd0557d00e69b276b7814",
    measurementId: "G-NGWRBL5YBR"
  },
};
