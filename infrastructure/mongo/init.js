const app = db.getSiblingDB('bara');
app.createUser({ user: process.env.MONGO_APP_USER, pwd: process.env.MONGO_APP_PASSWORD, roles: [{ role: 'readWrite', db: 'bara' }] });
app.createCollection('captures');
app.captures.createIndex({ createdAt: -1 });
app.captures.createIndex({ location: '2dsphere' });
app.captures.createIndex({ objectKey: 1 }, { unique: true, sparse: true });
