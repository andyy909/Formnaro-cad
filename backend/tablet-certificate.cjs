const dayMs = 24 * 60 * 60 * 1000;

async function createIdentity(ip, days = 1) {
  const { generate } = require('selfsigned');
  const { cert, private: key } = await generate(
    [{name:'commonName', value:'Formnaro-Tablet'}],
    {
      keyType:'ec',
      curve:'P-256',
      algorithm:'sha256',
      notAfterDate:new Date(Date.now() + days * dayMs),
      extensions:[
        {name:'basicConstraints', cA:false},
        {name:'keyUsage', digitalSignature:true},
        {name:'extKeyUsage', serverAuth:true},
        {name:'subjectAltName', altNames:[{type:7, ip}]}
      ]
    }
  );
  return {cert:Buffer.from(cert), key:Buffer.from(key)};
}

module.exports = {createIdentity};
