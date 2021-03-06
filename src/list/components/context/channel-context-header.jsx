import PropTypes from 'prop-types';
import React from 'react';
import Extras from '../channels/extras.jsx';
import LiveState from '../../../live-state.json';
import Avatar from '../channels/avatar.jsx';
import { LARGE_IMAGE } from '../../utils.js';

const ChannelContextHeader = (props) => {
    const extras = {
        viewers: 0,
        category: props.extras.category,
        liveState: props.liveState,
        provider: props.extras.provider,
        liveSince: 0
    };
    let thumbnail;
    if(props.liveState != LiveState.OFFLINE && props.liveState != LiveState.REDIRECT) {
        thumbnail = (
            <figure>
                <img src={ props.thumbnail } className="back" alt={ `Current thumbnail of ${props.uname}` } onLoad={ props.onUpdated }/>
                <Avatar image={ props.image } size={ LARGE_IMAGE }/>
            </figure>
        );
        extras.viewers = props.extras.viewers;
        extras.liveSince = props.extras.liveSince;
    }
    return (
        <section className="details">
            { thumbnail }
            <h2 className="title" lang={ props.language }>{ props.title }</h2>
            <Extras { ...extras }/>
        </section>
    );
};
ChannelContextHeader.propTypes = {
    uname: PropTypes.string.isRequired,
    liveState: PropTypes.oneOf(Object.values(LiveState)),
    language: PropTypes.string,
    title: PropTypes.string,
    thumbnail: PropTypes.string,
    image: PropTypes.objectOf(PropTypes.string).isRequired,
    extras: PropTypes.shape({
        category: PropTypes.string,
        provider: PropTypes.string.isRequired,
        viewers: PropTypes.number,
        liveSince: PropTypes.number
    }),
    onUpdated: PropTypes.func
};

export default ChannelContextHeader;
