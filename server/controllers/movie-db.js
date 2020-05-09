'use strict'

/**
 * @apiDefine SuccessResponse
 * @apiSuccess {Boolean} success Response status
 * @apiSuccess {String} code Result code
 * @apiSuccess {String} message Result message
 */

/**
 * @apiDefine OkResponseExample
 * @apiSuccessExample {json} SuccessResponse:
 *   {
 *     "success": true,
 *     "code": "OK",
 *     "message": "Success"
 *   }
 */

/**
 * @apiDefine ErrorResponse
 * @apiError {Boolean} success Response status
 * @apiError {String} code Error code
 * @apiError {String} message Error message
 *
 * @apiErrorExample {json} ErrorResponse:
 *   {
 *     "success": false,
 *     "code": "<ERROR_CODE>",
 *     "message": "<ERROR_MESSAGE>"
 *   }
 */

const
    dockerNames = require('docker-names'),
    express = require('express'),
    fetch = require('node-fetch'),
    jwt = require('jsonwebtoken'),
    moment = require('moment'),
    ms = require('ms'),
    _ = require('lodash'),
    AppManifest = require('../manifest'),
    APIError = require('../api-error'),
    BaseController = require('./base'),
    Constants = require('../constants')

class MovieDBController extends BaseController {
    /**
     * Handler chain function to validate user session
     * @type {function(...[*]=)}
     */
    handleValidateUserSession = this.handleAsync(async (req, res, next) => {
        // Get access token
        const userAccessToken = req.header("userAccessToken")

        // Validate session
        req.userAccess = await this.validateUserSession(userAccessToken)

        // Continue
        next()
    })
    handleGetAPIStatus = this.handleREST(() => {
        return {
            data: {
                name: AppManifest.AppName,
                version: AppManifest.AppVersion,
                uptime: this.startTime.fromNow()
            }
        }
    })
    handleGetProfile = this.handleRESTAsync(async (req) => {
        // Get user info
        const {userAccess: user} = req

        const u = await this.repositories.AppUser.findByPk(user.id)

        return {
            data: {
                id: u.extId,
                fullName: u.fullName,
                updatedAt: getUnixTime(u.updatedAt)
            }
        }
    })
    handleLogOut = this.handleRESTAsync(async req => {
        // Get session token
        const userAccessToken = req.header("userAccessToken")

        // Try validate session
        let session
        try {
            session = await this.validateUserSession(userAccessToken)
        } catch (e) {
            this.logger.error(`failed to validate user session. Error=${e.message}`)
            return
        }

        // Invalidate session
        const result = await this.repositories.AppUser.update({
            lastLogIn: null,
            updatedAt: new Date()
        }, {
            where: {id: session.id}
        })

        this.logger.debug(`Result=${result}`)
    })
    handleUpdateProfile = this.handleRESTAsync(async req => {
        // Get user info
        const {userAccess: user} = req

        // Get request body
        const body = req.body

        // Update user name
        await this.repositories.AppUser.update({
            fullName: body.fullName
        }, {
            where: {id: user.id}
        })
    })
    handleRefreshSession = this.handleRESTAsync(async req => {
        // Get user info
        const {userAccess: user} = req

        // Create new session
        const session = await this.newUserSession(user.id, user.extId, getUnixTime(new Date()))

        return {
            data: session
        }
    })

    constructor({config, components, repositories, server, logger}) {
        super({repositories, config, components, server})

        // Set time
        this.startTime = moment()

        // Create child logger
        this.logger = logger.child({scope: 'MovieDB.API'})

        // Init router
        this.router = express.Router()

        // Route
        this.route()
    }

    route() {
        /**
         * @api {get} Get API Status
         * @apiName GetAPIStatus
         * @apiGroup Common
         * @apiDescription Get API uptime status and version info
         *
         * @apiUse SuccessResponse
         * @apiSuccess {Object} data Response data
         * @apiSuccess {String} data.name API Name
         * @apiSuccess {String} data.version API Version
         * @apiSuccess {String} data.uptime API uptime
         *
         * @apiSuccessExample {json} SuccessResponse
         *   {
         *     "success": true,
         *     "code": "OK",
         *     "message": "Success",
         *     "data": {
         *       "name": "MovieDB.API",
         *       "version": "0.0.1",
         *       "uptime": "7 minutes ago"
         *     }
         *   }
         *
         */
        this.router.get('/', this.handleGetAPIStatus)

        /**
         * @api {post} /users/log-in Log In
         * @apiName LogIn
         * @apiGroup User
         * @apiDescription LogIn to 3rd party app using humanId Exchange Token
         *
         * @apiHeader {String} clientSecret Client credentials to access Api
         *
         * @apiParam {String} exchangeToken An exchange token that states user has been verified by humanId
         *
         * @apiUse SuccessResponse
         * @apiSuccess {Object} data Response data
         * @apiSuccess {String} data.token Access Token to App
         * @apiSuccess {String} data.expiredAt Access Token expired in unix epoch
         *
         * @apiSuccessExample {json} SuccessResponse
         * {
         *     "success": true,
         *     "code": "OK",
         *     "message": "Success",
         *     "data": {
         *         "token": "<JWT_USER_SESSION>"
         *         "expiredAt": 1589014574
         *     }
         * }
         *
         * @apiUse ErrorResponse
         */
        this.router.post('/users/log-in', this.handleValidateClientApp, this.handleLogIn)

        /**
         * @api {get} /users/profile Get User Profile
         * @apiName GetUserProfile
         * @apiGroup User
         * @apiDescription Get user profile by user access token
         *
         * @apiHeader {String} userAccessToken User Access Token
         *
         * @apiUse SuccessResponse
         * @apiSuccess {Object} data Response data
         * @apiSuccess {String} data.id User external identifier
         * @apiSuccess {String} data.fullName User Full Name
         * @apiSuccess {number} data.updatedAt Updated at timestamp in Unix Epoch
         *
         * @apiSuccessExample {json} SuccessResponse
         *   {
         *     "success": true,
         *     "code": "OK",
         *     "message": "Success",
         *     "data": {
         *       "id": "1589009542",
         *       "fullName": "John Doe",
         *       "updatedAt": 1589030434
         *     }
         *   }
         *
         * @apiUse ErrorResponse
         */
        this.router.get('/users/profile', this.handleValidateUserSession, this.handleGetProfile)

        /**
         * @api {put} /users/refresh-session Refresh Session
         * @apiName RefreshSession
         * @apiGroup User
         * @apiDescription Refresh user session
         *
         * @apiHeader {String} userAccessToken User Access Token
         *
         * @apiUse SuccessResponse
         * @apiSuccess {Object} data Response data
         * @apiSuccess {String} data.token Access Token to App
         * @apiSuccess {String} data.expiredAt Access Token expired in unix epoch
         *
         * @apiSuccessExample {json} SuccessResponse
         * {
         *     "success": true,
         *     "code": "OK",
         *     "message": "Success",
         *     "data": {
         *         "token": "<JWT_USER_SESSION>"
         *         "expiredAt": 1589014574
         *     }
         * }
         *
         * @apiUse ErrorResponse
         */
        this.router.put('/users/refresh-session', this.handleValidateUserSession, this.handleRefreshSession)

        /**
         * @api {put} /users/profile Update Profile
         * @apiName UpdateProfile
         * @apiGroup User
         * @apiDescription Update user profile by user access token
         *
         * @apiHeader {String} userAccessToken User Access Token
         *
         * @apiParam {String} fullName Update full name
         *
         * @apiUse SuccessResponse
         *
         * @apiUse OkResponseExample
         *
         * @apiUse ErrorResponse
         */
        this.router.put('/users/profile', this.handleValidateUserSession, this.handleUpdateProfile)

        /**
         * @api {put} /users/log-out Log Out
         * @apiName LogOut
         * @apiGroup User
         * @apiDescription Log out of App
         *
         * @apiHeader {String} userAccessToken User Access Token
         *
         * @apiUse SuccessResponse
         *
         * @apiUse OkResponseExample
         *
         * @apiUse ErrorResponse
         */
        this.router.put('/users/log-out', this.handleLogOut)
    }

    /**
     * Handler chain function to validate app as client
     * @type {function(...[*]=)}
     */
    handleValidateClientApp = (req, res, next) => {
        // Get client secret
        let clientSecret = req.header("clientSecret")

        // Validate client secret
        if (clientSecret !== this.config.client.appSecret) {
            throw new APIError(Constants.RESPONSE_ERROR_UNAUTHORIZED)
        }

        // Continue
        next()
    }

    /**
     * Generate session identifier
     *
     * @param {string} userExtId User external id
     * @param {number} lastLogInMillis User last login timestamp
     * @return {string} User Session Id
     */
    createSessionId(userExtId, lastLogInMillis) {
        const raw = `${userExtId}-${lastLogInMillis}`
        return this.components.Common.hmac(raw, this.config.client.sessionIdSecret)
    }

    /**
     * @param {string} userId User PK
     * @param {string} userExtId User External ID
     * @param {number} timestamp Last Log in timestamp
     * @return {Promise<UserSession>} User access token
     */
    async newUserSession(userId, userExtId, timestamp) {
        // Get jwt secret
        const {jwtSecret, jwtLifetime} = this.config.client

        await this.repositories.AppUser.update({
            lastLogIn: timestamp * 1000,
            updatedAt: timestamp * 1000
        }, {
            where: {id: userId}
        })

        // Create session id
        const sessionId = this.createSessionId(userExtId, timestamp)

        // Calculate expiredAt
        const durationMs = ms(jwtLifetime)
        const expiredAt = timestamp + (durationMs / 1000)

        // Create session
        const jwtSession = jwt.sign({
            exp: expiredAt,
            data: {
                userId: userExtId,
                sessionId: sessionId
            }
        }, jwtSecret)

        return {
            token: jwtSession,
            expiredAt: expiredAt
        }
    }

    /**
     * @typedef {Object} UserSession
     * @property {string} token User session JWT
     * @property {number} expiredAt Expired At in Unix Epoch
     */

    /**
     * Validate user session
     *
     * @param userAccessToken User JWT Access Token
     * @returns {Promise<{id: string, extId: string}>} User Session Payload
     */
    async validateUserSession(userAccessToken) {
        // Verify and extract payload from jwt
        const payload = await this.verifyJWT(userAccessToken)

        // Get user
        let user = await this.repositories.AppUser.findOne({
            where: {extId: payload.data.userId},
        })

        // If user not found, throw error
        if (!user) {
            throw new APIError(Constants.RESPONSE_ERROR_UNAUTHORIZED)
        }

        // Get last log in millis in UTC
        let lastLogIn;
        if (!user.lastLogIn) {
            lastLogIn = -1
        } else {
            lastLogIn = getUnixTime(user.lastLogIn)
        }

        // Generate session identifier
        const currentSessionId = this.createSessionId(user.extId, lastLogIn)

        // If current session id is different with payload, throw error
        if (currentSessionId !== payload.data.sessionId) {
            throw new APIError(Constants.RESPONSE_ERROR_UNAUTHORIZED)
        }

        // Return user payload
        return {
            id: user.id,
            extId: user.extId
        }
    }

    /**
     *  Validate user session
     *
     * @param {string} userAccessToken User instance
     */

    /**
     * @typedef {Object} UserSessionPayload
     * @property {string} id User Id
     * @property {string} extId User External Id
     */

    /**
     * Convert callback-style jwt verify function into Promise
     *
     * @param {string} token User access token
     * @returns {Promise<UserSessionJWTPayload>} User access token payload
     */
    verifyJWT = (token) => {
        return new Promise((resolve, reject) => {
            jwt.verify(token, this.config.client.jwtSecret, (err, payload) => {
                if (err || !payload) {
                    // Handle expire error
                    if (err instanceof jwt.TokenExpiredError) {
                        return reject(new APIError('ERR_1', {source: err}))
                    }
                    // Else, return invalid token
                    return reject(new APIError('ERR_2', {source: err}))
                }
                resolve(payload)
            })
        })
    }

    /**
     * @typedef {Object} UserSessionJWTPayload
     * @property {number} iat Issued At
     * @property {number} exp Expired At
     * @property {Object} data Session data
     * @property {string} data.userId User external identifier
     * @property {string} data.sessionId User session identifier
     */

    verifyExchangeToken = async (exchangeToken) => {
        // Get component config
        const conf = this.config.components.humanID

        // Create url
        const url = conf.baseUrl + '/mobile/users/verifyExchangeToken'

        // Send request
        const resp = await fetch(url, {
            method: 'post',
            body: JSON.stringify({
                appId: conf.appId,
                appSecret: conf.appSecret,
                exchangeToken
            }),
            headers: {'Content-Type': 'application/json'},
        })

        // Parse resp body
        const respBody = await resp.json()

        // If not success, throw error
        if (!respBody.success) {
            this.logger.debug(`Received error response.`, {respBody})
            throw new APIError('ERR_3')
        }

        return respBody.data.userHash
    }

    handleLogIn = this.handleRESTAsync(async (req) => {
        // Get request body
        let body = req.body

        // Validate body
        this.validate({exchangeToken: 'required'}, body)

        // Verify Exchange Token
        const userHash = await this.verifyExchangeToken(body.exchangeToken)

        // Get user, create if not exists
        let users = await this.repositories.AppUser.findOrCreate({
            where: {userHash: userHash},
            defaults: {
                extId: generateExtId(),
                userHash: userHash,
                fullName: _.startCase(dockerNames.getRandomName(false))
            }
        })

        // Create user session
        const user = users[0]
        const session = await this.newUserSession(user.id, user.extId, getUnixTime(new Date()))

        // Return response
        return {
            data: session
        }
    })
}

function generateExtId() {
    let id = getUnixTime(new Date())
    return `${id}`
}

function getUnixTime(t) {
    return Math.round(t.getTime() / 1000)
}

module.exports = MovieDBController