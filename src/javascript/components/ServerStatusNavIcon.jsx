import React from 'react';
import {useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {Cancel, Check, Server, Warning} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import {useModulePreferences} from '../hooks/useModulePreferences';
import styles from './ServerStatusNavIcon.scss';

// The same healthCheck field as the server status screen, so a refresh there updates the icon.
const SERVER_HEALTH_QUERY = gql`
    query ServerHealth {
        admin { jahia { healthCheck(severity: HIGH) { status { health } } } }
    }`;

const HEALTH_ICONS = {GREEN: Check, YELLOW: Warning, RED: Cancel};

/**
 * The icon of the Server Status (Community) entry in the administration tree: the icon of the aggregated
 * server health, in its color, before the label. The server icon stands in while the health loads.
 * The tree renders it with its own size and className.
 */
export const ServerStatusNavIcon = ({className, size}) => {
    const {t} = useTranslation('module-management-community');
    // A11y HIGH-8 (WCAG 2.2.4): only poll when the user has enabled auto-refresh
    const [preferences] = useModulePreferences();
    const {data} = useQuery(SERVER_HEALTH_QUERY, {
        fetchPolicy: 'cache-and-network',
        pollInterval: preferences.autoRefresh ? 60000 : 0
    });
    const health = data?.admin?.jahia?.healthCheck?.status?.health;
    const label = health ? t(`label.sam.navStatus.${health.toLowerCase()}`) : t('label.sam.status');
    const Icon = HEALTH_ICONS[health] || Server;

    return (
        <span className={`${styles.root} ${styles[health] || ''} ${className || ''}`}
              role="img"
              aria-label={label}
              title={label}
              data-testid="server-status-nav-icon"
              data-health={health}
        >
            <Icon size={size}/>
        </span>
    );
};

ServerStatusNavIcon.propTypes = {
    className: PropTypes.string,
    size: PropTypes.string
};

export default ServerStatusNavIcon;
