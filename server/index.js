import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Paths
const DATA_DIR = path.join(__dirname, '../src/data');
const ASSETS_DIR = path.join(__dirname, '../src/assets/documents');

// Serve static files
app.use('/assets/documents', express.static(ASSETS_DIR));

// Ensure directories exist
const ensureDir = async (dir) => {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
};

await ensureDir(DATA_DIR);
await ensureDir(ASSETS_DIR);

// Multer config for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, ASSETS_DIR);
    },
    filename: function (req, file, cb) {
        // Generate unique filename: timestamp-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Helper to read/write JSON
const readJson = async (filename) => {
    try {
        const data = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return []; // Return empty array if file doesn't exist
    }
};

const writeJson = async (filename, data) => {
    await fs.writeFile(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
};

// Routes

// Drivers
app.get('/api/drivers', async (req, res) => {
    const drivers = await readJson('drivers.json');
    res.json(drivers);
});

app.post('/api/drivers', async (req, res) => {
    const newDriver = req.body;
    const drivers = await readJson('drivers.json');
    drivers.push(newDriver);
    await writeJson('drivers.json', drivers);
    res.json(newDriver);
});

app.put('/api/drivers/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const drivers = await readJson('drivers.json');
    const index = drivers.findIndex(d => d.id === id);

    if (index !== -1) {
        drivers[index] = { ...drivers[index], ...updates };
        await writeJson('drivers.json', drivers);
        res.json(drivers[index]);
    } else {
        res.status(404).json({ error: 'Driver not found' });
    }
});

app.delete('/api/drivers/:id', async (req, res) => {
    const { id } = req.params;
    let drivers = await readJson('drivers.json');
    drivers = drivers.filter(d => d.id !== id);
    await writeJson('drivers.json', drivers);
    res.json({ success: true });
});

// Vehicles
app.get('/api/vehicles', async (req, res) => {
    const vehicles = await readJson('vehicles.json');
    res.json(vehicles);
});

app.post('/api/vehicles', async (req, res) => {
    const newVehicle = req.body;
    const vehicles = await readJson('vehicles.json');
    vehicles.push(newVehicle);
    await writeJson('vehicles.json', vehicles);
    res.json(newVehicle);
});

app.put('/api/vehicles/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const vehicles = await readJson('vehicles.json');
    const index = vehicles.findIndex(v => v.id === id);

    if (index !== -1) {
        vehicles[index] = { ...vehicles[index], ...updates };
        await writeJson('vehicles.json', vehicles);
        res.json(vehicles[index]);
    } else {
        res.status(404).json({ error: 'Vehicle not found' });
    }
});

app.delete('/api/vehicles/:id', async (req, res) => {
    const { id } = req.params;
    let vehicles = await readJson('vehicles.json');
    vehicles = vehicles.filter(v => v.id !== id);
    await writeJson('vehicles.json', vehicles);
    res.json({ success: true });
});

// File Upload
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // Return the relative path that allows the frontend to access via existing setup or import
    // In a real production setup, we'd serve /assets statically. 
    // For Vite dev server, importing from src might work if structured correctly, 
    // but let's return a path we can use. 
    // Since we are moving to a server model, we should serve the assets directory purely statically.

    res.json({
        path: `/src/assets/documents/${req.file.filename}`,
        filename: req.file.filename
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
