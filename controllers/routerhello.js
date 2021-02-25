const info = async (ctx, next) => {
    ctx.render('render-test.html')
}

module.exports = {
    'GET /render': info
}