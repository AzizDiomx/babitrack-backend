"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const rateLimiter_middleware_1 = require("./middlewares/rateLimiter.middleware");
// Configuration CORS sécurisée (Production & Développement)
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:8081',
        'https://babitrack.net',
        'https://www.babitrack.net',
    ];
const isOriginAllowed = (origin) => {
    // Autoriser les requêtes sans header Origin (applications mobiles React Native, curl, backend-to-backend)
    if (!origin)
        return true;
    // Autoriser les origines spécifiées ou les sous-domaines de babitrack.net
    if (allowedOrigins.includes(origin) ||
        /^https:\/\/([a-z0-9-]+\.)?babitrack\.net$/.test(origin)) {
        return true;
    }
    // En environnement hors-production, autoriser le réseau local et les émulateurs mobiles
    if (process.env.NODE_ENV !== 'production' &&
        /^(http:\/\/localhost:\d+|http:\/\/127\.0\.0\.1:\d+|http:\/\/192\.168\.\d+\.\d+:\d+|http:\/\/10\.0\.2\.2:\d+)/.test(origin)) {
        return true;
    }
    return false;
};
const corsOptions = {
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error(`Bloqué par la politique de sécurité CORS BabiTrack: ${origin}`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
// Charger les variables d'environnement
dotenv_1.default.config();
const company_routes_1 = __importDefault(require("./routes/company.routes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const vehicle_routes_1 = __importDefault(require("./routes/vehicle.routes"));
const route_routes_1 = __importDefault(require("./routes/route.routes"));
const trip_routes_1 = __importDefault(require("./routes/trip.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const saasPlan_routes_1 = __importDefault(require("./routes/saasPlan.routes"));
const paymentRequest_routes_1 = __importDefault(require("./routes/paymentRequest.routes"));
const app = (0, express_1.default)();
exports.app = app;
const server = http_1.default.createServer(app);
exports.server = server;
const io = new socket_io_1.Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (isOriginAllowed(origin)) {
                callback(null, true);
            }
            else {
                callback(new Error(`Socket CORS non autorisé: ${origin}`));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },
});
exports.io = io;
app.set('io', io);
const PORT = process.env.PORT || 3000;
// Middlewares globaux de sécurité
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: false }));
app.use((0, cors_1.default)(corsOptions));
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '10mb' }));
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Limiteur global sur toutes les routes /api
app.use('/api', rateLimiter_middleware_1.globalApiLimiter);
// Routes de l'API
app.use('/api/companies', company_routes_1.default);
app.use('/api/auth', auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
app.use('/api/vehicles', vehicle_routes_1.default);
app.use('/api/routes', route_routes_1.default);
app.use('/api/trips', trip_routes_1.default);
app.use('/api/notifications', notification_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/saas-plans', saasPlan_routes_1.default);
app.use('/api/payment-requests', paymentRequest_routes_1.default);
// Route de base de santé de l'API
app.get('/health', (_req, res) => {
    res.json({
        status: 'UP',
        created_at: new Date(),
        service: 'BabiTrack Backend (SaaS Multi-Tenant)'
    });
});
const socket_service_1 = require("./services/socket.service");
const subscriptionCron_service_1 = require("./services/subscriptionCron.service");
(0, socket_service_1.initializeSocketService)(io);
(0, subscriptionCron_service_1.initSubscriptionCron)();
// Démarrer le serveur uniquement s'il n'est pas importé pour les tests
if (process.env.NODE_ENV !== 'test') {
    server.listen(PORT, () => {
        console.log(`==================================================`);
        console.log(`BabiTrack Backend démarré avec succès !`);
        console.log(`URL: http://localhost:${PORT}`);
        console.log(`==================================================`);
    });
}
