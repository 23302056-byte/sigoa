const mysql = require('mysql2');

const conexion = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '12345678',
    database: 'sigoa',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = conexion;