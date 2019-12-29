const srcPath = './build/modemjs';
const dstPath = '../docs';


const fs = require('fs-extra');

fs.remove(dstPath)
    .then(() => {
        console.log(`Cleaned ${dstPath} folder successfully.`)

        fs.move(srcPath, dstPath, { overwrite: true })
            .then(() => {
                console.log(`Moved files in ${srcPath} to ${dstPath} folder successfully.`);
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

    })
    .catch(err => {
        console.error(`fs.remove(${dstPath}) error:`, err)
    });