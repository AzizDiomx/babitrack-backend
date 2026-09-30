"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRefreshToken = exports.verifyAccessToken = exports.generateRefreshToken = exports.generateAccessToken = exports.getJwtRefreshSecret = exports.getJwtSecret = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('FATAL SECURITY ERROR: Variable d\'environnement JWT_SECRET non configurée.');
    }
    return secret;
};
exports.getJwtSecret = getJwtSecret;
const getJwtRefreshSecret = () => {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
        throw new Error('FATAL SECURITY ERROR: Variable d\'environnement JWT_REFRESH_SECRET non configurée.');
    }
    return secret;
};
exports.getJwtRefreshSecret = getJwtRefreshSecret;
const generateAccessToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, (0, exports.getJwtSecret)(), { expiresIn: '5h' });
};
exports.generateAccessToken = generateAccessToken;
const generateRefreshToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, (0, exports.getJwtRefreshSecret)(), { expiresIn: '30d' });
};
exports.generateRefreshToken = generateRefreshToken;
const verifyAccessToken = (token) => {
    return jsonwebtoken_1.default.verify(token, (0, exports.getJwtSecret)());
};
exports.verifyAccessToken = verifyAccessToken;
const verifyRefreshToken = (token) => {
    return jsonwebtoken_1.default.verify(token, (0, exports.getJwtRefreshSecret)());
};
exports.verifyRefreshToken = verifyRefreshToken;
