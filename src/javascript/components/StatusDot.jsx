import React from 'react';
import {Typography} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import styles from './StatusDot.scss';

/** A colored dot before a status label, lighter than a Chip for a value that repeats on every row. */
export const StatusDot = ({tone, variant = 'body', children, ...props}) => (
    <Typography component="span" variant={variant} className={styles.status} {...props}>
        <span className={`${styles.dot} ${styles[tone]}`} aria-hidden="true"/>
        {children}
    </Typography>
);

StatusDot.propTypes = {
    tone: PropTypes.oneOf(['success', 'warning', 'danger']).isRequired,
    variant: PropTypes.string,
    children: PropTypes.node
};

export default StatusDot;
