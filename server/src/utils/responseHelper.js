const sendSuccess = (res, data, message, statusCode = 200) => {
  const response = { success: true, data };
  if (message) response.message = message;
  res.status(statusCode).json(response);
};

const sendError = (res, message, statusCode = 400) => {
  res.status(statusCode).json({
    success: false,
    message,
  });
};

const sendPaginated = (res, data, total, page, limit) => {
  res.status(200).json({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
};

module.exports = { sendSuccess, sendError, sendPaginated };
