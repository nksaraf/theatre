const constructMapDescriptor = (m: $FixMe, d: $FixMe) => {
  // if (desP.isPointer !== true) throw Error('Pointers only')

  // return desP.flatMap(m => {
  //   return (
      m &&
      m.mapValues(v => {
        // debugger
        return constructValue.default(v, d)
      })
  //   )
  // })
}

const constructValue = require('./constructValue')

export default constructMapDescriptor
