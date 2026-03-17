// scripts/seed.js
// Creates a demo garage + owner user for development
require('dotenv').config();
const mongoose   = require('mongoose');
const { env }    = require('../src/config/env');
const { Garage, GarageUser } = require('../src/models');

async function seed() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Create garage
  let garage = await Garage.findOne({ contactNo: '9999999999' });
  if (!garage) {
    garage = await Garage.create({
      garageName:  'Demo Garage',
      ownerName:   'Demo Owner',
      garageType:  'BOTH',
      contactNo:   '9999999999',
      email:       'demo@garblaz.com',
      address:     '123 Main St, Pune',
      state:       'Maharashtra',
    });
    console.log('✅ Created garage:', garage._id.toString());
  } else {
    console.log('ℹ️  Garage already exists:', garage._id.toString());
  }

  // Create owner user
  let user = await GarageUser.findOne({ email: 'owner@garblaz.com' });
  if (!user) {
    user = await GarageUser.create({
      garageId: garage._id,
      name:     'Demo Owner',
      phone:    '9876543210',
      email:    'owner@garblaz.com',
      role:     'GARAGE_OWNER',
    });
    console.log('✅ Created user:', user._id.toString());
    console.log('   Email: owner@garblaz.com');
    console.log('   Use POST /api/auth/request-otp to login');
  } else {
    console.log('ℹ️  User already exists');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch(console.error);
