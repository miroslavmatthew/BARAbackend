const connection = new Mongo(`mongodb://${process.env.MONGO_APP_USER}:${process.env.MONGO_APP_PASSWORD}@localhost:27017/bara?authSource=bara`);
const app = connection.getDB('bara');
const id = new ObjectId();
try {
  app.captures.insertOne({ _id: id, objectKey: `smoke/${id}`, createdAt: new Date(), location: { type: 'Point', coordinates: [106.8, -6.2] }, smokeTest: true });
  if (!app.captures.findOne({ _id: id })) throw new Error('Read-back failed');
  print('MongoDB application-user write/read passed.');
  print('Capture indexes: ' + app.captures.getIndexes().map(i => i.name).join(', '));
} finally { app.captures.deleteOne({ _id: id }); }
