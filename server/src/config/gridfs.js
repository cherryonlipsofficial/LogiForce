const mongoose = require('mongoose');

let bucket;

const getGridFSBucket = () => {
  if (!bucket) {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('MongoDB connection not established yet');
    }
    bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'uploads' });
  }
  return bucket;
};

const uploadToGridFS = (buffer, filename, metadata = {}) => {
  return new Promise((resolve, reject) => {
    const bucket = getGridFSBucket();
    const uploadStream = bucket.openUploadStream(filename, { metadata });

    uploadStream.on('finish', function () {
      resolve({
        fileId: uploadStream.id,
        filename: uploadStream.filename,
      });
    });

    uploadStream.on('error', (err) => {
      reject(err);
    });

    uploadStream.end(buffer);
  });
};

const downloadFromGridFS = (fileId) => {
  const bucket = getGridFSBucket();
  const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  return bucket.openDownloadStream(objectId);
};

const getFileInfo = async (fileId) => {
  const bucket = getGridFSBucket();
  const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  const files = await bucket.find({ _id: objectId }).toArray();
  return files[0] || null;
};

const deleteFromGridFS = async (fileId) => {
  const bucket = getGridFSBucket();
  const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  await bucket.delete(objectId);
};

const downloadToBuffer = (fileId) => {
  return new Promise((resolve, reject) => {
    const stream = downloadFromGridFS(fileId);
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err) => reject(err));
  });
};

module.exports = {
  getGridFSBucket,
  uploadToGridFS,
  downloadFromGridFS,
  getFileInfo,
  deleteFromGridFS,
  downloadToBuffer,
};
