const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'logiforce/driver-documents',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
    resource_type: 'auto',
  },
});

const upload = multer({ storage });

module.exports = upload;
