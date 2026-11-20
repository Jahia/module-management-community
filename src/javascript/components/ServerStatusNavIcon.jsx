import React, {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {Cancel, Check, Server, Warning} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import {useModulePreferences} from '../hooks/useModulePreferences';
import styles from './ServerStatusNavIcon.scss';

// The same healthCheck field and severity as the server status screen, so a refresh there updates the icon.
const SERVER_HEALTH_QUERY = gql`
    query ServerHealth($severity: GqlProbeSeverity) {
        admin { jahia { healthCheck(severity: $severity) { status { health } } } }
    }`;

const HEALTH_ICONS = {GREEN: Check, YELLOW: Warning, RED: Cancel};

const isPageVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/** Whether the browser tab shows the page; a hidden tab needs no poll. */
const usePageVisible = () => {
    const [isVisible, setIsVisible] = useState(isPageVisible);
    useEffect(() => {
        const update = () => setIsVisible(isPageVisible());
        document.addEventListener('visibilitychange', update);
        return () => document.removeEventListener('visibilitychange', update);
    }, []);
    return isVisible;
};

/**
 * The icon of the Server Status (Community) entry in the administration tree: the icon of the aggregated
 * server health, in its color, before the label. The server icon stands in while the health loads.
 * The tree renders it with its own size and className.
 */
export const ServerStatusNavIcon = ({className, size}) => {
    const {t} = useTranslation('module-management-community');
    // A11y HIGH-8 (WCAG 2.2.2): only poll when the user has enabled auto-refresh; the preference is shared live
    const [preferences] = useModulePreferences();
    const isVisible = usePageVisible();
    // The icon mounts with the administration tree on every admin screen. cache-first runs one health check
    // per severity for the session, not one per navigation; only the poll asks the server again.
    const {data} = useQuery(SERVER_HEALTH_QUERY, {
        variables: {severity: preferences.probeSeverity},
        fetchPolicy: 'cache-first',
        pollInterval: preferences.autoRefresh && isVisible ? 60000 : 0
    });
    const health = data?.admin?.jahia?.healthCheck?.status?.health;
    const description = health ? t('label.sam.navHealth', {health: t(`label.sam.health.${health.toLowerCase()}`), interpolation: {escapeValue: false}}) : '';
    const Icon = HEALTH_ICONS[health] || Server;

    const rootRef = useRef(null);
    const descriptionId = `server-status-nav-health${useId()}`;

    // The tree item takes its name from its whole content, so the icon is hidden from that name and the
    // health becomes the description of the tree item, which the tree component does not let us set.
    useEffect(() => {
        const item = rootRef.current?.closest('[role="treeitem"]');
        if (!item) {
            return undefined;
        }

        const id = descriptionId;
        const ids = (item.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        if (!ids.includes(id)) {
            item.setAttribute('aria-describedby', [...ids, id].join(' '));
        }

        return () => {
            const rest = (item.getAttribute('aria-describedby') || '').split(/\s+/).filter(v => v && v !== id);
            if (rest.length > 0) {
                item.setAttribute('aria-describedby', rest.join(' '));
            } else {
                item.removeAttribute('aria-describedby');
            }
        };
    });

    return (
        <span ref={rootRef}
              className={`${styles.root} ${styles[health] || ''} ${className || ''}`}
              aria-hidden="true"
              title={description || undefined}
              data-testid="server-status-nav-icon"
              data-health={health}
        >
            <Icon size={size}/>
            {/* Chrome adds a referenced node to the name of the tree item when it sits inside the item,
                even under aria-hidden, so the description lives outside the tree, hidden. */}
            {createPortal(<span hidden id={descriptionId}>{description}</span>, document.body)}
        </span>
    );
};

ServerStatusNavIcon.propTypes = {
    className: PropTypes.string,
    size: PropTypes.string
};

export default ServerStatusNavIcon;
