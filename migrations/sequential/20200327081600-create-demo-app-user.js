'use strict';

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.createTable('AppUser', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.BIGINT
            },
            extId: {
                allowNull: false,
                type: Sequelize.STRING,
            },
            userHash: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            fullName: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            lastLogIn: {
                type: Sequelize.DATE,
                allowNull: true
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
            }
        })
            .then(() => {
                return queryInterface.addIndex('AppUser', ['userHash'])
            })
    },
    down: (queryInterface) => {
        return queryInterface.dropTable('AppUser');
    }
};