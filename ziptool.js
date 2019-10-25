const zlb = require('zlib')

module.exports = {
  zip(data) {
    return zlb.deflateRawSync(data, {
      memLevel: 9,
      windowBits: 15,
      level: 8
    })
  },
  zipAsync(data, cbSuc, cbErr) {
    return zlb.deflateRaw(data, {
      memLevel: 9,
      windowBits: 15,
      level: 8
    }, (err, buf) => {
      if (err) cbErr(err)
      else cbSuc(buf)
    })
  },
  unzip(zData) {
    return zlb.inflateRawSync(zData, {
      windowBits: 15
    })
  },
  standardZip(data) {
    return zlb.gzipSync(data, {
      memLevel: 9,
      windowBits: 15,
      level: 8
    })
  },
  /**
   * @returns {Promise<Buffer>}
   */
  standardZipAsync(data) {

    return new Promise((res, rej) => {

      zlb.gzip(data, { memLevel: 9, windowBits: 15, level: 8 }, (err, buf) => {
        if (err) rej(err)
        else res(buf)
      })
    })
  },
  standardUnZip(data) {
    return zlb.gunzipSync(data, {
      windowBits: 15
    })
  }
}
