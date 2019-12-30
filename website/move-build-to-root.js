const srcPath = './build/modemjs';
const dstPath = '../../modemjs';


const fs = require('fs-extra');

fs.copy(srcPath, dstPath, { overwrite: true })
    .then(() => {
        console.log(`Copied files in ${srcPath} to ${dstPath} folder successfully.`);
        fs.remove('./build')
            .then(() => {
                console.log(`Removed build folder successfully.`)
            })
            .catch(err => {
                console.error('fs.remove(\'./build\') error:', err)
            });
    })
    .catch(err => {
        console.error(`fs.move(${srcPath},${dstPath}) error:`, err)
    });