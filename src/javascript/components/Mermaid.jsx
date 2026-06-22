import React, {useCallback, useEffect, useRef, useState} from 'react';
import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';
import PropTypes from 'prop-types';

let instanceCount = 0;

/**
 * Parse a mermaid flowchart definition into a plain-text list of edges
 * ("X depends on Y") for a visually-hidden text alternative (A11y CRITICAL-5).
 * Node ids are de-quoted and bracketed labels stripped so the output reads naturally.
 */
const parseEdges = definition => {
    if (!definition) {
        return [];
    }

    const clean = token => token
        .trim()
        // Strip a trailing node label in [..], (..), {..} and keep the id/label text
        .replace(/^([^[({]+)[[({].*$/, '$1')
        .replace(/["']/g, '')
        .trim();

    return definition
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.includes('-->'))
        .map(line => {
            // Drop an optional edge label: A -->|label| B
            const withoutLabel = line.replace(/\|[^|]*\|/g, ' ');
            const [from, to] = withoutLabel.split('-->');
            return from && to ? {from: clean(from), to: clean(to)} : null;
        })
        .filter(Boolean);
};

const Mermaid = ({className, children, onError, ariaLabel}) => {
    const [element, setElement] = useState();
    const [renderResult, setRenderResult] = useState();

    // Stable ID: assigned once on mount, never changes on re-renders.
    // Using a ref guard prevents instanceCount from incrementing on every render,
    // which would make containerId a new value each render and trigger an infinite
    // useEffect loop (containerId in deps → setRenderResult → re-render → new ID → …).
    const containerIdRef = useRef(null);
    if (containerIdRef.current === null) {
        containerIdRef.current = `d${instanceCount++}-mermaid`;
    }

    const containerId = containerIdRef.current;
    const diagramText = children;
    const descId = `${containerId}-desc`;
    // Dedupe edges so each "X depends on Y" is listed once and keys stay unique.
    const edges = Array.from(
        new Map(parseEdges(diagramText).map(e => [`${e.from}->${e.to}`, e])).values()
    );

    // Initialize mermaid once on mount
    useEffect(() => {
        mermaid.registerLayoutLoaders(elkLayouts);
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'neutral',
            logLevel: 0,
            layout: 'elk',
            elk: {
                mergeEdges: true,
                edgeRouting: 'LINEAR_SEGMENTS'
            },
            flowchart: {
                defaultRenderer: 'elk'
            }
        });
    }, []);

    // Track the container DOM element via a stable callback ref
    const updateDiagramRef = useCallback(elem => {
        if (!elem) {
            return;
        }

        setElement(elem);
    }, []);

    // Inject the rendered SVG into the container whenever either changes
    useEffect(() => {
        if (!element || !renderResult?.svg) {
            return;
        }

        element.innerHTML = renderResult.svg;
        renderResult.bindFunctions?.(element);
    }, [element, renderResult]);

    // Re-render the diagram whenever the diagram text changes
    useEffect(() => {
        if (!diagramText || diagramText.length === 0) {
            return;
        }

        (async () => {
            try {
                const rr = await mermaid.render(`${containerId}-svg`, diagramText);
                setRenderResult(rr);
            } catch (e) {
                onError?.(e);
            }
        })();
    // ContainerId is stable (ref) — safe to include; diagramText drives re-renders
    }, [containerId, diagramText, onError]);

    return (
        <>
            {/* A11y C-013 / D-005: role="img", keyboard focus, localised label via ariaLabel prop.
                CRITICAL-5: aria-describedby points to a visually-hidden edge list. */}
            <div ref={updateDiagramRef}
                 className={className}
                 id={containerId}
                 role="img"
                 tabIndex={0}
                 aria-label={ariaLabel || 'Dependency graph'}
                 aria-describedby={edges.length > 0 ? descId : undefined}
            />
            {edges.length > 0 && (
                <ul
                    id={descId}
                    style={{
                        position: 'absolute',
                        width: '1px',
                        height: '1px',
                        margin: '-1px',
                        padding: 0,
                        border: 0,
                        overflow: 'hidden',
                        clip: 'rect(0, 0, 0, 0)',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {edges.map(edge => (
                        <li key={`${edge.from}->${edge.to}`}>{`${edge.from} depends on ${edge.to}`}</li>
                    ))}
                </ul>
            )}
        </>
    );
};

Mermaid.propTypes = {
    className: PropTypes.string,
    children: PropTypes.any.isRequired,
    onError: PropTypes.func,
    ariaLabel: PropTypes.string
};

export default Mermaid;
