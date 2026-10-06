// Shared Firebase project configuration for the local agent (firebase-agent.js).
// This is the same "web app" config Firebase gives you for a browser app, and the
// identical values the dashboard's own sign-in page uses — it isn't a secret; what
// actually protects the data is signing in via Firebase Authentication plus the
// Realtime Database security rules in database.rules.json.
module.exports = {
    apiKey: 'AIzaSyBPqwi4EA0Ta746PiNfkmdHaJFikwFJJFA',
    authDomain: 'rfidproject-e2225.firebaseapp.com',
    databaseURL: 'https://rfidproject-e2225-default-rtdb.firebaseio.com',
    projectId: 'rfidproject-e2225',
    storageBucket: 'rfidproject-e2225.firebasestorage.app',
    messagingSenderId: '880640517617',
    appId: '1:880640517617:web:bb11c0c44aec8cb968d050'
};

// Every path written to the Realtime Database is namespaced under this id, so one
// Firebase project could in principle host more than one local agent (e.g. two
// different machines/projects) without colliding. Override with the
// FIREBASE_AGENT_ID env var if you ever need a second one; the dashboard's sign-in
// page lets you pick which agent id to watch.
module.exports.AGENT_ID = process.env.FIREBASE_AGENT_ID || 'main';
