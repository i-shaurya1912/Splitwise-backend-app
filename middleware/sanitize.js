// Recursively removes any keys starting with '$' or containing '.'
// This prevents NoSQL injection via operators like $gt, $where, etc.
function sanitizeObject(obj) {
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const clean = {};
  for (const key in obj) {
    if (key.startsWith('$') || key.includes('.')) {
      continue; // skip dangerous keys
    }
    clean[key] = sanitizeObject(obj[key]);
  }
  return clean;
}

const sanitizeMiddleware = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  next();
};

module.exports = sanitizeMiddleware;