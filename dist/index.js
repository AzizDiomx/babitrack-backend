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
const app = (0, express_1.default)();
exports.app = app;
const server = http_1.default.createServer(app);
exports.server = server;
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PATCH', 'DELETE']
    }
});
exports.io = io;
app.set('io', io);
const PORT = process.env.PORT || 3000;
// Middlewares globaux
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: false }));
app.use((0, cors_1.default)());
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json());
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Routes de l'API
app.use('/api/companies', company_routes_1.default);
app.use('/api/auth', auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
app.use('/api/vehicles', vehicle_routes_1.default);
app.use('/api/routes', route_routes_1.default);
app.use('/api/trips', trip_routes_1.default);
app.use('/api/notifications', notification_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
// Route de base de santé de l'API
app.get('/health', (_req, res) => {
    res.json({
        status: 'UP',
        timestamp: new Date(),
        service: 'BabiTrack Backend (SaaS Multi-Tenant)'
    });
});
const socket_service_1 = require("./services/socket.service");
(0, socket_service_1.initializeSocketService)(io);
// Démarrer le serveur uniquement s'il n'est pas importé pour les tests
if (process.env.NODE_ENV !== 'test') {
    server.listen(PORT, () => {
        console.log(`==================================================`);
        console.log(`BabiTrack Backend démarré avec succès !`);
        console.log(`URL: http://localhost:${PORT}`);
        console.log(`==================================================`);
    });
}
