const multer = require('multer');
const path = require('path');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|pdf|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only jpg, jpeg, png, pdf, and webp files are allowed'));
    }
  },
});

module.exports = upload;
