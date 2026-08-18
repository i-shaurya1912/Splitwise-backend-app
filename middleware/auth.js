const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // 1. Header se token nikalo
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token, access denied' });
  }

  const token = authHeader.split(' ')[1]; // "Bearer <token>" me se token nikalo

  try {
    // 2. Token verify karo
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 3. User ki info request me attach kar do, taaki aage routes me use ho sake
    req.userId = decoded.userId;
    
    next(); // sab theek hai, aage badho
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = authMiddleware;