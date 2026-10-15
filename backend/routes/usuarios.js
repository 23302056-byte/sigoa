const express = require('express');
const router = express.Router();
const db = require('../db');

function validarPersona({ nombre, apellidos, correo, password }) {
    if (!nombre?.trim() || !apellidos?.trim() || !correo?.trim() || !password) {
        return 'Nombre, apellidos, correo y contraseña son obligatorios';
    }
    if (!/^\S+@\S+\.\S+$/.test(correo.trim())) return 'Escribe un correo válido';
    if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
    return null;
}

router.get('/', async (req, res) => {
    try {
        const [clientes] = await db.promise().query(`
            SELECT id_cliente AS id, nombre, apellidos, correo, telefono, direccion, activo
            FROM clientes ORDER BY apellidos, nombre
        `);
        const [arquitectos] = await db.promise().query(`
            SELECT u.id_usuario AS id, u.nombre, u.apellidos, u.correo, u.telefono, u.activo,
                   COUNT(DISTINCT p.id_proyecto) AS proyectos
            FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
            LEFT JOIN proyectos p ON p.id_arquitecto = u.id_usuario
            WHERE r.nombre = 'Arquitecto'
            GROUP BY u.id_usuario, u.nombre, u.apellidos, u.correo, u.telefono, u.activo
            ORDER BY u.apellidos, u.nombre
        `);
        res.json({ success: true, clientes, arquitectos });
    } catch (error) {
        console.error('Error al cargar clientes y arquitectos:', error);
        res.status(500).json({ success: false, mensaje: 'No se pudieron cargar clientes y arquitectos' });
    }
});

router.post('/clientes', async (req, res) => {
    const errorValidacion = validarPersona(req.body);
    if (errorValidacion) return res.status(400).json({ success: false, mensaje: errorValidacion });
    const { nombre, apellidos, correo, telefono, direccion, password } = req.body;
    let conexion;
    try {
        conexion = await db.promise().getConnection();
        await conexion.beginTransaction();
        const [roles] = await conexion.query("SELECT id_rol FROM roles WHERE nombre = 'Cliente' LIMIT 1");
        if (!roles.length) throw new Error('No está registrado el rol Cliente');
        const [usuario] = await conexion.execute(
            'INSERT INTO usuarios (id_rol, nombre, apellidos, correo, password_hash, telefono) VALUES (?, ?, ?, ?, ?, ?)',
            [roles[0].id_rol, nombre.trim(), apellidos.trim(), correo.trim().toLowerCase(), password, telefono?.trim() || null]
        );
        const [cliente] = await conexion.execute(
            'INSERT INTO clientes (id_usuario, nombre, apellidos, correo, telefono, direccion) VALUES (?, ?, ?, ?, ?, ?)',
            [usuario.insertId, nombre.trim(), apellidos.trim(), correo.trim().toLowerCase(), telefono?.trim() || null, direccion?.trim() || null]
        );
        await conexion.commit();
        return res.status(201).json({ success: true, id: cliente.insertId, mensaje: 'Cliente creado correctamente' });
    } catch (error) {
        if (conexion) await conexion.rollback();
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, mensaje: 'Ya existe una cuenta con ese correo' });
        console.error('Error al crear cliente:', error);
        return res.status(500).json({ success: false, mensaje: error.message || 'No se pudo crear el cliente' });
    } finally {
        conexion?.release();
    }
});

router.post('/arquitectos', async (req, res) => {
    const errorValidacion = validarPersona(req.body);
    if (errorValidacion) return res.status(400).json({ success: false, mensaje: errorValidacion });
    const { nombre, apellidos, correo, telefono, password } = req.body;
    try {
        const [roles] = await db.promise().query("SELECT id_rol FROM roles WHERE nombre = 'Arquitecto' LIMIT 1");
        if (!roles.length) return res.status(500).json({ success: false, mensaje: 'No está registrado el rol Arquitecto' });
        const [resultado] = await db.promise().execute(
            'INSERT INTO usuarios (id_rol, nombre, apellidos, correo, password_hash, telefono) VALUES (?, ?, ?, ?, ?, ?)',
            [roles[0].id_rol, nombre.trim(), apellidos.trim(), correo.trim().toLowerCase(), password, telefono?.trim() || null]
        );
        return res.status(201).json({ success: true, id: resultado.insertId, mensaje: 'Arquitecto creado correctamente' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, mensaje: 'Ya existe una cuenta con ese correo' });
        console.error('Error al crear arquitecto:', error);
        return res.status(500).json({ success: false, mensaje: 'No se pudo crear el arquitecto' });
    }
});

router.delete('/clientes/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, mensaje: 'Identificador de cliente no válido' });
    let conexion;
    try {
        conexion = await db.promise().getConnection();
        await conexion.beginTransaction();
        const [clientes] = await conexion.execute('SELECT id_usuario FROM clientes WHERE id_cliente = ? FOR UPDATE', [id]);
        if (!clientes.length) {
            await conexion.rollback();
            return res.status(404).json({ success: false, mensaje: 'Cliente no encontrado' });
        }
        await conexion.execute('DELETE FROM clientes WHERE id_cliente = ?', [id]);
        if (clientes[0].id_usuario) await conexion.execute('DELETE FROM usuarios WHERE id_usuario = ?', [clientes[0].id_usuario]);
        await conexion.commit();
        return res.json({ success: true, mensaje: 'Cliente eliminado correctamente' });
    } catch (error) {
        if (conexion) await conexion.rollback();
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
            return res.status(409).json({ success: false, mensaje: 'No se puede borrar este cliente porque tiene proyectos u otros registros asociados' });
        }
        console.error('Error al eliminar cliente:', error);
        return res.status(500).json({ success: false, mensaje: 'No se pudo eliminar el cliente' });
    } finally {
        conexion?.release();
    }
});

router.delete('/arquitectos/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, mensaje: 'Identificador de arquitecto no válido' });
    try {
        const [roles] = await db.promise().query("SELECT id_rol FROM roles WHERE nombre = 'Arquitecto' LIMIT 1");
        if (!roles.length) return res.status(500).json({ success: false, mensaje: 'No está registrado el rol Arquitecto' });
        const [resultado] = await db.promise().execute('DELETE FROM usuarios WHERE id_usuario = ? AND id_rol = ?', [id, roles[0].id_rol]);
        if (!resultado.affectedRows) return res.status(404).json({ success: false, mensaje: 'Arquitecto no encontrado' });
        return res.json({ success: true, mensaje: 'Arquitecto eliminado correctamente' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
            return res.status(409).json({ success: false, mensaje: 'No se puede borrar este arquitecto porque tiene registros históricos asociados' });
        }
        console.error('Error al eliminar arquitecto:', error);
        return res.status(500).json({ success: false, mensaje: 'No se pudo eliminar el arquitecto' });
    }
});

module.exports = router;
