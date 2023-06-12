db.createUser({
  user: 'admin',
  pwd: 'password',
  roles: [
    { role: 'readWrite', db: '__inxt-network' },
    { role: 'readAnyDatabase', db: 'admin' }
  ],
});

db.createCollection('bucketentries');
db.createCollection('buckets');
db.createCollection('contacts');
db.createCollection('exchangereports');
db.createCollection('frames');
db.createCollection('fullaudits');
db.createCollection('marketings');
db.createCollection('mirrors');
db.createCollection('partners');
db.createCollection('pointers');
db.createCollection('publickeys');
db.createCollection('referrals');
db.createCollection('shards');
db.createCollection('storageevents');
db.createCollection('tokens');
db.createCollection('usernonces');
db.createCollection('users');