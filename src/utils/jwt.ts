import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'o2TEzCqo9p2Xeq0J4zB29pUsAfLo5ouM48XVHksZ5NR';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || '3I7KeWGibRDSgjxrvsHNIuW9hknp07L0ApHg4dkUPew';

export interface TokenPayload {
  userId: string;
  role: string;
  companyId: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '5h' });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '30d' });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
};
