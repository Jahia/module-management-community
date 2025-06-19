import React from 'react';
import PropTypes from 'prop-types';
import {Typography} from '@jahia/moonstone';
import {Divider} from '@material-ui/core';

const BundleDescriptionList = ({bundle}) => (
    <div style={{padding: 16}}>
        <Typography variant="title" weight="bold">
            {bundle.symbolicName} (v{bundle.version})
        </Typography>
        <Divider sx={{mb: 2}}/>

        <dl style={{display: 'flex', gap: 32}}>
            <div style={{minWidth: 120}}>
                <dt>
                    <Typography variant="subheading" weight="semiBold">
                        Services
                    </Typography>
                </dt>
                {bundle.services && bundle.services.length > 0 ? (
                    bundle.services.map(service => (
                        <dd key={service} style={{margin: 0}}>
                            <Typography variant="body1">{service}</Typography>
                        </dd>
                    ))
                ) : (
                    <dd>
                        <Typography variant="body2" color="text.secondary">
                            No services
                        </Typography>
                    </dd>
                )}
            </div>
            <div style={{minWidth: 120}}>
                <dt>
                    <Typography variant="subheading" weight="semiBold">
                        Nodetypes
                    </Typography>
                </dt>
                {bundle.nodeTypesDependencies && bundle.nodeTypesDependencies.length > 0 ? (
                    bundle.nodeTypesDependencies.map(nodeType => (
                        <dd key={nodeType} style={{margin: 0}}>
                            <Typography variant="body1">{nodeType}</Typography>
                        </dd>
                    ))
                ) : (
                    <dd>
                        <Typography variant="body2" color="text.secondary">
                            No nodetypes
                        </Typography>
                    </dd>
                )}
            </div>
        </dl>

        <Divider sx={{my: 2}}/>

        <Typography gutterBottom variant="subtitle1">
            Manifest
        </Typography>
        <dl style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignContent: 'space-between'
        }}
        >
            {bundle.manifest && bundle.manifest.length > 0 ? (
                bundle.manifest.map(entry => (
                    <div key={entry.key}
                         style={{
                             minWidth: 120,
                             display: 'flex',
                             flexDirection: 'row',
                             gap: 10,
                             marginLeft: 10
                         }}
                    >
                        <dt>
                            <Typography variant="body2" color="text.secondary">
                                {entry.key}
                            </Typography>
                        </dt>
                        <dd style={{margin: 0}}>
                            <ul style={{listStyleType: 'none'}}>
                                {entry.value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(value => (
                                    <li key={`s-${value.toLowerCase().trim()}`}>
                                        <Typography variant="body" style={{margin: 0}}>
                                            {value.trim()}
                                        </Typography>
                                    </li>
                                ))}
                            </ul>
                        </dd>
                    </div>
                ))
            ) : (
                <div>
                    <dd>
                        <Typography variant="body" weight="bold">
                            No manifest entries
                        </Typography>
                    </dd>
                </div>
            )}
        </dl>
    </div>
);

BundleDescriptionList.propTypes = {
    bundle: PropTypes.shape({
        symbolicName: PropTypes.string.isRequired,
        version: PropTypes.string.isRequired,
        services: PropTypes.arrayOf(PropTypes.string),
        nodeTypesDependencies: PropTypes.arrayOf(PropTypes.string),
        manifest: PropTypes.arrayOf(
            PropTypes.shape({
                key: PropTypes.string.isRequired,
                value: PropTypes.string.isRequired
            })
        )
    }).isRequired
};

export default BundleDescriptionList;
