import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

let db;

self.onmessage = async (event) => {
  const { type, sql, params, statements, msgId, dbName } = event.data;

  if (type === 'INIT') {
    try {
      if (db) db.close(); 
      const sqlite3 = await sqlite3InitModule();
      if (sqlite3.opfs) {
        db = new sqlite3.oo1.OpfsDb(`/${dbName}.sqlite3`);
        postMessage({ msgId, type: 'READY' });
      } else {
        postMessage({ msgId, type: 'ERROR', payload: 'OPFS not supported' });
      }
    } catch (error) {
      postMessage({ msgId, type: 'ERROR', payload: error.message });
    }
    return;
  }

  if (!db) {
    postMessage({ msgId, type: 'ERROR', payload: 'Database not initialized' });
    return;
  }

  // query functions
  if (type === 'QUERY') {
    try {
      const rows = [];
      db.exec({
        sql: sql,
        bind: params,
        rowMode: 'object',
        callback: (row) => rows.push(row),
      });
      postMessage({ msgId, type: 'RESULT', payload: rows });
    } catch (error) {
      postMessage({ msgId, type: 'ERROR', payload: error.message });
    }
  } 
  
  // execution functions
  else if (type === 'EXECUTE') {
    try {
      db.exec({ sql: sql, bind: params });
      postMessage({ msgId, type: 'SUCCESS' });
    } catch (error) {
      postMessage({ msgId, type: 'ERROR', payload: error.message });
    }
  } 
  
  // transaction functions
  else if (type === 'BATCH') {
    try {
      db.exec('BEGIN TRANSACTION');
      for (const { sql: batchSql, params: batchParams = [] } of statements) {
        db.exec({ sql: batchSql, bind: batchParams });
      }
      db.exec('COMMIT');
      postMessage({ msgId, type: 'SUCCESS' });
    } catch (error) {
      db.exec('ROLLBACK');
      postMessage({ msgId, type: 'ERROR', payload: error.message });
    }
  } 
  
  // connection functions
  else if (type === 'CLOSE') {
    db?.close();
    postMessage({ msgId, type: 'CLOSED' });
  }
};