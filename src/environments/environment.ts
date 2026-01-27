export const environment = {
  production: false,
  apiGpsUrl: 'http://13.59.90.173:3020',
  cloudFunctionsUrl: 'https://us-central1-driverappve.cloudfunctions.net/api/v1',
  firebase: {
    apiKey: 'AIzaSyBLTB4Zkc7DlD9y4OfNlawQYdlZnjtnXEo',
    authDomain: 'driverappve.firebaseapp.com',
    projectId: 'driverappve',
    storageBucket: 'driverappve.firebasestorage.app',
    messagingSenderId: '441354356093',
    appId: '1:441354356093:web:3dd0557d00e69b276b7814',
    measurementId: 'G-NGWRBL5YBR'
  },
  mapDefaults: {
    center: { lat: 7.7677778, lng: -72.234686 },
    zoom: 12,
    tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }
};
