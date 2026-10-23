import express from 'express';
import cors from 'cors';
import { dbConfig, checkDatabaseConnection } from './config/db.js';
import authRouter from './routes/auth.js';
import countingRouter from './routes/counting.js';
import { authenticateKey } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend clients
app.use(cors());

// Enable JSON body parsing
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Root route: API overview
app.get('/', (req, res) => {
  res.json({
    name: 'Machine Production Monitoring API',
    description: 'Backend API for Machine Production Monitoring System',
    status: 'online',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: 'GET /api/health',
      auth: {
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
        logout: 'POST /api/auth/logout',
      },
      counting: {
        upsertBundle: 'POST /api/counting/upsert (header + lines)',
        getHeaders: 'GET /api/counting/headers',
        getHeaderDetail: 'GET /api/counting/headers/:prodId',
        upsertHeader: 'POST /api/counting/headers',
        deleteHeader: 'DELETE /api/counting/headers/:prodId',
        getLines: 'GET /api/counting/lines?ProdId=...',
        getLineDetail: 'GET /api/counting/lines/:prodId/:roolNumber',
        upsertLines: 'POST /api/counting/lines',
        deleteLine: 'DELETE /api/counting/lines/:prodId/:roolNumber',
      },
    },
  });
});

// Health check handler
const handleHealthCheck = async (req, res) => {
  const dbHealth = await checkDatabaseConnection();

  const isHealthy = dbHealth.connected;
  const httpStatus = isHealthy ? 200 : 503;

  const response = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: {
      name: 'Machine Production Monitoring API',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
    },
    database: {
      type: 'PostgreSQL',
      status: dbHealth.connected ? 'connected' : 'disconnected',
      latency: `${dbHealth.latencyMs}ms`,
      host: dbHealth.config.host,
      port: dbHealth.config.port,
      database: dbHealth.config.database,
      ssl: dbHealth.config.ssl,
      ...(dbHealth.connected
        ? {
            serverTime: dbHealth.serverTime,
            version: dbHealth.version,
          }
        : {
            error: dbHealth.error,
            code: dbHealth.code,
          }),
    },
  };

  return res.status(httpStatus).json(response);
};

// Health endpoints
app.get('/api/health', handleHealthCheck);
app.get('/health', handleHealthCheck);

// Authentication endpoints
app.use('/api/auth', authRouter);

// Counting Kain CRUD endpoints
app.use('/api/counting', countingRouter);
app.use('/api/counting-kain', countingRouter);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    status: 404,
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(500).json({
    status: 500,
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred.',
  });
});

// Start listening
const server = app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(` Machine Production Monitoring API Server`);
  console.log(` Server running on: http://localhost:${PORT}`);
  console.log(` Health check URL : http://localhost:${PORT}/api/health`);
  console.log(` Configured DB Host: ${dbConfig.host}:${dbConfig.port}`);
  console.log(` Configured DB Name: ${dbConfig.database}`);
  console.log(` Configured DB User: ${dbConfig.user}`);
  console.log('='.repeat(60));
});

export { app, authenticateKey };
export default app;
